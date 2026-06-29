// Mirrors apps/server/src/types.ts (kept local — no shared package yet, YAGNI).
export type TrafficLabel = "empty" | "low" | "high" | "jam";

export const TRAFFIC_LABELS: TrafficLabel[] = ["empty", "low", "high", "jam"];

export interface BinaryOutput {
	detected: boolean;
	confidence: number;
}

export interface Inference {
	traffic: {
		label: TrafficLabel;
		confidence: number;
		probs?: Record<TrafficLabel, number>;
	};
	accident: BinaryOutput;
	ambulance: BinaryOutput;
	siren: BinaryOutput;
}

export interface SignalPlan {
	cycle: number;
	demand: number;
	phases: { approachId: string; green: number }[];
	preempt?: string;
}

export interface Approach {
	id: string;
	label: TrafficLabel;
	emergency?: boolean;
	accident?: boolean;
}

export interface Vehicles {
	count: number;
	label: TrafficLabel;
}

export interface ClassifyResponse {
	ok: boolean;
	inference?: Inference;
	approach?: Approach;
	plan?: SignalPlan;
	error?: string;
}

/** A live /stream event: ClassifyResponse plus the streaming extras. */
export interface Verdict extends ClassifyResponse {
	uncertainty?: number;
	vehicles?: Vehicles;
	thumb?: string; // data: URI of the sampled frame
	frame?: number;
	ts?: number; // server epoch seconds
}
