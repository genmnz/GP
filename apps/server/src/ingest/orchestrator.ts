/**
 * Orchestrator — the online data flow:
 *   frame(+audio) -> ML /infer -> fuse to approaches -> signal engine ->
 *   persist (inferences, signal_plans, events) -> [broadcast later].
 *
 * One TS function owns the whole decision + logging path.
 */
import { db, events, inferences, signalPlans } from "@ziko/db";
import { computeSignalPlan } from "../traffic/signal-engine";
import type { Inference, SignalPlan } from "../types";
import { infer, toApproach } from "./ml-client";

export interface FrameInput {
	approachId: string;
	image: Blob;
	audio?: Blob;
}

export interface CycleResult {
	plan: SignalPlan;
	inferences: { approachId: string; inference: Inference }[];
}

/** Run one inference + signalling cycle for an intersection and log everything. */
export async function runInferenceCycle(
	intersectionId: string,
	frames: FrameInput[],
): Promise<CycleResult> {
	const results: { approachId: string; inference: Inference }[] = [];

	for (const f of frames) {
		const inference = await infer(f.image, f.audio);
		results.push({ approachId: f.approachId, inference });
	}

	const approaches = results.map((r) => toApproach(r.approachId, r.inference));
	const plan = computeSignalPlan(approaches);

	// Persist inferences.
	for (const { approachId, inference } of results) {
		const emergency = inference.ambulance.detected || inference.siren.detected;
		await db.insert(inferences).values({
			intersectionId,
			approachId,
			trafficLabel: inference.traffic.label,
			trafficConfidence: inference.traffic.confidence,
			accidentDetected: inference.accident.detected,
			accidentConfidence: inference.accident.confidence,
			ambulanceDetected: inference.ambulance.detected,
			ambulanceConfidence: inference.ambulance.confidence,
			sirenDetected: inference.siren.detected,
			sirenConfidence: inference.siren.confidence,
			emergency,
			rawJson: JSON.stringify(inference),
		});

		// Raise events for alerts.
		if (inference.accident.detected) {
			await db.insert(events).values({
				intersectionId,
				type: "accident",
				confidence: inference.accident.confidence,
				payloadJson: JSON.stringify({ approachId }),
			});
		}
		if (emergency) {
			await db.insert(events).values({
				intersectionId,
				type: "emergency",
				confidence: Math.max(
					inference.ambulance.confidence,
					inference.siren.confidence,
				),
				payloadJson: JSON.stringify({
					approachId,
					vision: inference.ambulance.detected,
					audio: inference.siren.detected,
				}),
			});
		}
	}

	// Persist the plan + its demand math.
	await db.insert(signalPlans).values({
		intersectionId,
		cycle: plan.cycle,
		demand: plan.demand,
		preemptApproachId: plan.preempt ?? null,
		planJson: JSON.stringify(plan.phases),
	});

	return { plan, inferences: results };
}
