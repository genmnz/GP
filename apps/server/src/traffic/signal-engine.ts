/**
 * Signal engine — a pure, testable function that turns the AI's congestion
 * labels into a bounded, demand-proportional green split with emergency
 * preemption. No I/O, no DB, no framework.
 *
 * THE EQUATION (mirrored in services/ml/app/scoring.py):
 *
 *   weight        W(label) ∈ {empty:1, low:2, high:3, jam:4}
 *   demand        D = (Σ W(labelᵢ)) / (W_max · N)              ∈ (0, 1]
 *   cycle         C = clamp(round(C_MIN + (C_MAX − C_MIN)·D), C_MIN, C_MAX)
 *   green budget  B = max(C − LOST·N, G_MIN·N)
 *   green split   gᵢ = max(G_MIN, round((W(labelᵢ) / Σ W(labelⱼ)) · B))
 *
 * Emergency preemption short-circuits the split: hold green for the flagged
 * approach, zero the rest.
 */
import { type Approach, type SignalPlan, W_MAX, WEIGHTS } from "../types";

export const C_MIN = 40; // bounded cycle length floor (seconds)
export const C_MAX = 120; // bounded cycle length ceiling (seconds)
export const G_MIN = 7; // minimum green per approach (seconds)
export const LOST = 4; // yellow + all-red clearance per phase (seconds)
export const EMERGENCY_GREEN = G_MIN * 3;

export function computeSignalPlan(approaches: Approach[]): SignalPlan {
	if (approaches.length === 0) {
		return { cycle: C_MIN, demand: 0, phases: [] };
	}

	// 1) Emergency preemption — hold green for the ambulance/siren approach.
	const emergency = approaches.find((a) => a.emergency);
	if (emergency) {
		return {
			cycle: EMERGENCY_GREEN,
			demand: 1,
			preempt: emergency.id,
			phases: approaches.map((a) => ({
				approachId: a.id,
				green: a.id === emergency.id ? EMERGENCY_GREEN : 0,
			})),
		};
	}

	// 2) Demand-proportional split inside a bounded cycle.
	const n = approaches.length;
	const weights = approaches.map((a) => WEIGHTS[a.label]);
	const totalW = weights.reduce((s, x) => s + x, 0) || 1;

	const demand = totalW / (W_MAX * n); // 0..1
	const cycle = clamp(
		Math.round(C_MIN + (C_MAX - C_MIN) * demand),
		C_MIN,
		C_MAX,
	);
	const budget = Math.max(cycle - LOST * n, G_MIN * n);

	return {
		cycle,
		demand,
		phases: approaches.map((a) => ({
			approachId: a.id,
			green: Math.max(G_MIN, Math.round((WEIGHTS[a.label] / totalW) * budget)),
		})),
	};
}

function clamp(x: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, x));
}
