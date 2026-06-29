import { Elysia, t } from "elysia";
import { infer, toApproach } from "./ingest/ml-client";
import { streamVerdicts } from "./ingest/stream";
import { computeSignalPlan } from "./traffic/signal-engine";

/**
 * HTTP surface for the dashboard. The "dataset in -> JSON out" viewer posts an
 * image here; we forward it to the Python ML service, fuse the result into an
 * approach, run the signal engine, and return the whole picture as JSON.
 */
export const api = new Elysia({ prefix: "/api" })
	.post(
		"/classify",
		async ({ body, set }) => {
			try {
				const inference = await infer(body.image, body.audio ?? undefined);
				const approach = toApproach("approach-1", inference);
				const plan = computeSignalPlan([approach]);
				return { ok: true as const, inference, approach, plan };
			} catch (e) {
				set.status = 502;
				return {
					ok: false as const,
					error: e instanceof Error ? e.message : String(e),
				};
			}
		},
		{
			body: t.Object({
				image: t.File(),
				audio: t.Optional(t.File()),
			}),
		},
	)
	.get(
		/**
		 * Live verdicts as Server-Sent Events. Bun resolves + decodes the stream
		 * (yt-dlp + ffmpeg) and calls Python `/infer` per sampled frame. Plug in a
		 * YouTube/HLS/RTSP/file URL; re-verdicts one frame every `interval` seconds.
		 */
		"/stream",
		({ query, request }) => {
			const url = query.url;
			const interval = Math.min(30, Math.max(1, Number(query.interval ?? 3)));
			const ac = new AbortController();
			request.signal.addEventListener("abort", () => ac.abort());

			const enc = new TextEncoder();
			const body = new ReadableStream({
				async start(controller) {
					try {
						for await (const v of streamVerdicts(url, interval, ac.signal)) {
							controller.enqueue(enc.encode(`data: ${JSON.stringify(v)}\n\n`));
						}
					} catch (e) {
						const error = e instanceof Error ? e.message : String(e);
						controller.enqueue(
							enc.encode(
								`event: error\ndata: ${JSON.stringify({ error })}\n\n`,
							),
						);
					} finally {
						controller.close();
					}
				},
				cancel() {
					ac.abort();
				},
			});

			return new Response(body, {
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
				},
			});
		},
		{
			query: t.Object({
				url: t.String(),
				interval: t.Optional(t.String()),
			}),
		},
	);
