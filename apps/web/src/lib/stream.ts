// EventSource client for the live verdict stream. The Bun server owns the
// pipeline (yt-dlp + ffmpeg + signal engine); Python only runs the model.
import { SERVER_URL } from "./config";
import type { Verdict } from "./types";

export interface StreamHandlers {
	onVerdict: (v: Verdict) => void;
	onError: (msg: string) => void;
	onOpen?: () => void;
}

/**
 * Open a live verdict stream. Returns a stop() that closes the connection.
 * `url` is any stream the server can resolve: a YouTube watch URL, an HLS
 * .m3u8, an RTSP/RTMP URL, or a direct video file URL.
 */
export function openStream(
	url: string,
	interval: number,
	handlers: StreamHandlers,
): () => void {
	const qs = new URLSearchParams({ url, interval: String(interval) });
	const es = new EventSource(`${SERVER_URL}/api/stream?${qs.toString()}`);
	let stopped = false;

	es.onopen = () => handlers.onOpen?.();
	es.onmessage = (e) => {
		try {
			handlers.onVerdict(JSON.parse(e.data) as Verdict);
		} catch {
			/* ignore malformed frame */
		}
	};
	// Our server emits `event: error` with a JSON payload for fatal stream errors;
	// the browser also fires a dataless "error" on a dropped/closed connection.
	es.addEventListener("error", (e) => {
		if (stopped) return;
		const data = (e as MessageEvent).data;
		if (data) {
			try {
				handlers.onError(JSON.parse(data).error ?? String(data));
			} catch {
				handlers.onError(String(data));
			}
			es.close();
		} else {
			handlers.onError("stream connection lost");
		}
	});

	return () => {
		stopped = true;
		es.close();
	};
}
