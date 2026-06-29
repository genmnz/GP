/** Congestion classes — the 4-class output of the traffic model. */
export type TrafficLabel = "empty" | "low" | "high" | "jam";

export const TRAFFIC_LABELS: readonly TrafficLabel[] = [
	"empty",
	"low",
	"high",
	"jam",
] as const;

/** Ordinal congestion weights. Mirrors services/ml/app/scoring.py exactly. */
export const WEIGHTS: Record<TrafficLabel, number> = {
	empty: 1,
	low: 2,
	high: 3,
	jam: 4,
};
export const W_MAX = 4;

/** One model's binary output. */
export interface BinaryOutput {
	detected: boolean;
	confidence: number;
}

/** The full multi-model inference contract returned by Python `/infer`. */
export interface Inference {
	traffic: {
		label: TrafficLabel;
		confidence: number;
		probs?: Record<TrafficLabel, number>;
	};
	accident: BinaryOutput;
	ambulance: BinaryOutput; // vision
	siren: BinaryOutput; // audio
}

/** What the signal engine actually consumes — a label and two booleans. */
export interface Approach {
	id: string;
	label: TrafficLabel;
	emergency?: boolean;
	accident?: boolean;
}

export interface SignalPhase {
	approachId: string;
	green: number;
}

export interface SignalPlan {
	cycle: number;
	demand: number; // normalized demand D in (0,1]
	phases: SignalPhase[];
	preempt?: string;
}
