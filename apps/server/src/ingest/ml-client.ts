/**
 * Thin client for the Python ML service. The only place TS talks to Python.
 * Python does inference; every decision afterwards happens here in TS.
 */
import { env } from "@ziko/env/server";
import type { Approach, Inference } from "../types";

const ML_URL = env.ML_URL;

export interface InferOptions {
	timeoutMs?: number;
}

/** POST a frame (+ optional audio) to the ML service and get predictions back. */
export async function infer(
	frame: Blob,
	audio?: Blob,
	opts: InferOptions = {},
): Promise<Inference> {
	const fd = new FormData();
	fd.append("image", frame, "frame.jpg");
	if (audio) fd.append("audio", audio, "audio.wav");

	const res = await fetch(`${ML_URL}/infer`, {
		method: "POST",
		body: fd,
		signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
	});
	if (!res.ok)
		throw new Error(`ml infer failed: ${res.status} ${await res.text()}`);
	return (await res.json()) as Inference;
}

/**
 * Fuse a single camera's inference into an Approach the engine understands.
 * The emergency signal is `ambulance(vision) || siren(audio)` — vision-or-audio
 * redundancy is a stronger signal than either alone.
 */
export function toApproach(approachId: string, inf: Inference): Approach {
	return {
		id: approachId,
		label: inf.traffic.label,
		emergency: inf.ambulance.detected || inf.siren.detected,
		accident: inf.accident.detected,
	};
}
