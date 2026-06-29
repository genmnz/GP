// Shared taxonomy, weights, colors and small math helpers used across the
// classifier and live panels. Mirrors app/config.py + scoring.py on the server.
import type { Inference, TrafficLabel } from "./types";

export const WEIGHTS: Record<TrafficLabel, number> = {
	empty: 1,
	low: 2,
	high: 3,
	jam: 4,
};
export const W_MAX = 4;

export interface LabelStyle {
	text: string;
	bg: string;
	ring: string;
	hex: string; // for inline SVG
	glow: string;
}

export const LABEL_STYLE: Record<TrafficLabel, LabelStyle> = {
	empty: {
		text: "text-emerald-400",
		bg: "bg-emerald-500",
		ring: "ring-emerald-500/40",
		hex: "#10b981",
		glow: "shadow-[0_0_24px_-4px] shadow-emerald-500/50",
	},
	low: {
		text: "text-lime-400",
		bg: "bg-lime-500",
		ring: "ring-lime-500/40",
		hex: "#84cc16",
		glow: "shadow-[0_0_24px_-4px] shadow-lime-500/50",
	},
	high: {
		text: "text-amber-400",
		bg: "bg-amber-500",
		ring: "ring-amber-500/40",
		hex: "#f59e0b",
		glow: "shadow-[0_0_24px_-4px] shadow-amber-500/50",
	},
	jam: {
		text: "text-red-400",
		bg: "bg-red-500",
		ring: "ring-red-500/40",
		hex: "#ef4444",
		glow: "shadow-[0_0_24px_-4px] shadow-red-500/50",
	},
};

export const LABEL_BLURB: Record<TrafficLabel, string> = {
	empty: "free road — no demand",
	low: "light, free-flowing traffic",
	high: "heavy but moving",
	jam: "congested / standstill",
};

/** Ordinal weight of a label (1..4). */
export const weight = (l: TrafficLabel): number => WEIGHTS[l];

/** Normalised Shannon entropy of the distribution -> uncertainty in [0,1]. */
export function entropy(probs?: Partial<Record<TrafficLabel, number>>): number {
	if (!probs) return 0;
	const vals = Object.values(probs).filter((p): p is number => !!p && p > 0);
	if (!vals.length) return 0;
	const h = -vals.reduce((s, p) => s + p * Math.log(p), 0);
	return h / Math.log(4);
}

/** Do the classifier and the YOLO vehicle-count agree on the label? */
export function agreement(
	classifier: TrafficLabel,
	counter: TrafficLabel,
): "match" | "near" | "off" {
	const d = Math.abs(weight(classifier) - weight(counter));
	return d === 0 ? "match" : d === 1 ? "near" : "off";
}

export function probsOf(inf: Inference): Record<TrafficLabel, number> {
	const base: Record<TrafficLabel, number> = {
		empty: 0,
		low: 0,
		high: 0,
		jam: 0,
	};
	if (inf.traffic.probs) return { ...base, ...inf.traffic.probs };
	base[inf.traffic.label] = inf.traffic.confidence;
	return base;
}
