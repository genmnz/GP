/**
 * Live-stream ingestion — in TypeScript, per the architecture rule that Python
 * touches *only* the models. Bun resolves the stream (yt-dlp), decodes frames
 * (ffmpeg), and for each frame calls Python `/infer`, then runs the signal
 * engine here. No OpenCV / Python video stack required.
 *
 * Requires two binaries on PATH: `ffmpeg` and `yt-dlp`.
 */
import { computeSignalPlan } from "../traffic/signal-engine";
import type { Inference, TrafficLabel } from "../types";
import { infer, toApproach } from "./ml-client";

const DIRECT_EXT = [".m3u8", ".mp4", ".mkv", ".webm", ".avi", ".mov", ".ts"];

/** Resolve a watch-page URL (YouTube, etc.) to a direct media URL ffmpeg can read.
 *  Direct media URLs, RTSP/RTMP, and local files pass through unchanged. */
export async function resolveStreamUrl(url: string): Promise<string> {
	const lower = url.toLowerCase().split("?")[0] ?? url.toLowerCase();
	if (
		DIRECT_EXT.some((e) => lower.endsWith(e)) ||
		url.startsWith("rtsp://") ||
		url.startsWith("rtmp://") ||
		url.startsWith("file:") ||
		url.startsWith("/") ||
		/^[a-zA-Z]:[\\/]/.test(url)
	) {
		return url;
	}

	const proc = Bun.spawn(
		["yt-dlp", "-g", "--no-warnings", "-f", "best[height<=720]/best", url],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const out = await new Response(proc.stdout).text();
	const code = await proc.exited;
	const first = out
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean)[0];
	if (code !== 0 || !first) {
		const err = (await new Response(proc.stderr).text()).trim();
		throw new Error(
			`yt-dlp could not resolve the stream: ${err.split("\n").pop() || `exit ${code}`}`,
		);
	}
	return first; // first line is the video stream (muxed or video-only HLS)
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
	const out = new Uint8Array(a.length + b.length);
	out.set(a, 0);
	out.set(b, a.length);
	return out;
}

/** Index of a 2-byte marker (e.g. JPEG SOI FFD8 / EOI FFD9) from `from`. */
function marker(buf: Uint8Array, b2: number, from: number): number {
	for (let i = from; i < buf.length - 1; i++) {
		if (buf[i] === 0xff && buf[i + 1] === b2) return i;
	}
	return -1;
}

/** Spawn ffmpeg and yield one JPEG buffer every `interval` seconds. */
export async function* frameStream(
	url: string,
	interval: number,
	signal?: AbortSignal,
): AsyncGenerator<Uint8Array> {
	const src = await resolveStreamUrl(url);
	const isHttp = src.startsWith("http");
	const fps = `1/${Math.max(1, Math.round(interval))}`;

	const proc = Bun.spawn(
		[
			"ffmpeg",
			"-loglevel",
			"error",
			...(isHttp
				? [
						"-reconnect",
						"1",
						"-reconnect_streamed",
						"1",
						"-reconnect_delay_max",
						"5",
					]
				: []),
			"-i",
			src,
			"-vf",
			`fps=${fps},scale=640:-2`,
			"-f",
			"image2pipe",
			"-vcodec",
			"mjpeg",
			"-q:v",
			"5",
			"pipe:1",
		],
		{ stdout: "pipe", stderr: "pipe" },
	);

	signal?.addEventListener("abort", () => proc.kill());

	// keep the tail of ffmpeg's stderr so a failed stream gives a real message
	let stderrTail = "";
	const dec = new TextDecoder();
	(async () => {
		try {
			for await (const c of proc.stderr as unknown as AsyncIterable<Uint8Array>) {
				stderrTail = (stderrTail + dec.decode(c)).slice(-500);
			}
		} catch {
			/* ignore */
		}
	})();

	let produced = false;
	let buf: Uint8Array = new Uint8Array(0);
	try {
		for await (const chunk of proc.stdout as unknown as AsyncIterable<Uint8Array>) {
			buf = concat(buf, chunk);
			while (true) {
				const soi = marker(buf, 0xd8, 0);
				if (soi < 0) {
					buf = new Uint8Array(0);
					break;
				}
				const eoi = marker(buf, 0xd9, soi + 2);
				if (eoi < 0) {
					if (soi > 0) buf = buf.slice(soi);
					break;
				}
				produced = true;
				yield buf.slice(soi, eoi + 2);
				buf = buf.slice(eoi + 2);
			}
		}
	} finally {
		proc.kill();
	}

	const code = await proc.exited;
	if (!produced && !signal?.aborted) {
		throw new Error(
			`ffmpeg produced no frames: ${stderrTail.trim().split("\n").pop() || `exit ${code}`}`,
		);
	}
}

function entropy(probs?: Record<TrafficLabel, number>): number {
	if (!probs) return 0;
	const vals = Object.values(probs).filter((p) => p > 0);
	if (!vals.length) return 0;
	const h = -vals.reduce((s, p) => s + p * Math.log(p), 0);
	return h / Math.log(4);
}

export interface StreamVerdict {
	ok: boolean;
	inference?: Inference;
	approach?: ReturnType<typeof toApproach>;
	plan?: ReturnType<typeof computeSignalPlan>;
	uncertainty?: number;
	thumb?: string;
	frame?: number;
	ts?: number;
	error?: string;
}

/** The full per-frame pipeline: frame -> Python /infer -> signal engine -> verdict. */
export async function* streamVerdicts(
	url: string,
	interval: number,
	signal?: AbortSignal,
): AsyncGenerator<StreamVerdict> {
	let i = 0;
	for await (const jpg of frameStream(url, interval, signal)) {
		const blob = new Blob([jpg], { type: "image/jpeg" });
		let inference: Inference;
		try {
			inference = await infer(blob, undefined, { timeoutMs: 8000 });
		} catch (e) {
			yield {
				ok: false,
				error: `infer failed: ${e instanceof Error ? e.message : String(e)}`,
			};
			continue;
		}
		const approach = toApproach("approach-1", inference);
		const plan = computeSignalPlan([approach]);
		yield {
			ok: true,
			inference,
			approach,
			plan,
			uncertainty: entropy(inference.traffic.probs),
			thumb: `data:image/jpeg;base64,${Buffer.from(jpg).toString("base64")}`,
			frame: i++,
			ts: Date.now() / 1000,
		};
	}
}
