import { describe, expect, test } from "bun:test";
import {
	C_MAX,
	C_MIN,
	computeSignalPlan,
	EMERGENCY_GREEN,
	G_MIN,
} from "../src/traffic/signal-engine";
import type { Approach } from "../src/types";

const ap = (
	id: string,
	label: Approach["label"],
	extra: Partial<Approach> = {},
): Approach => ({
	id,
	label,
	...extra,
});

describe("computeSignalPlan", () => {
	test("empty intersection -> floor cycle, no phases", () => {
		const plan = computeSignalPlan([]);
		expect(plan.cycle).toBe(C_MIN);
		expect(plan.phases).toHaveLength(0);
	});

	test("all-empty approaches -> low demand, short cycle", () => {
		const plan = computeSignalPlan([ap("n", "empty"), ap("s", "empty")]);
		expect(plan.demand).toBeCloseTo(0.25, 5); // (1+1)/(4*2)
		expect(plan.cycle).toBe(C_MIN + Math.round((C_MAX - C_MIN) * 0.25));
	});

	test("all-jam approaches -> max demand, max cycle", () => {
		const plan = computeSignalPlan([ap("n", "jam"), ap("s", "jam")]);
		expect(plan.demand).toBeCloseTo(1, 5);
		expect(plan.cycle).toBe(C_MAX);
	});

	const greenOf = (
		plan: { phases: { approachId: string; green: number }[] },
		id: string,
	) => plan.phases.find((p) => p.approachId === id)?.green ?? -1;

	test("busier approach gets more green", () => {
		const plan = computeSignalPlan([ap("n", "jam"), ap("s", "low")]);
		expect(greenOf(plan, "n")).toBeGreaterThan(greenOf(plan, "s"));
	});

	test("every phase respects the minimum green", () => {
		const plan = computeSignalPlan([
			ap("n", "empty"),
			ap("e", "empty"),
			ap("s", "empty"),
			ap("w", "jam"),
		]);
		for (const p of plan.phases) expect(p.green).toBeGreaterThanOrEqual(G_MIN);
	});

	test("emergency preempts: flagged approach holds green, others zeroed", () => {
		const plan = computeSignalPlan([
			ap("n", "high"),
			ap("s", "low", { emergency: true }),
		]);
		expect(plan.preempt).toBe("s");
		expect(greenOf(plan, "s")).toBe(EMERGENCY_GREEN);
		expect(greenOf(plan, "n")).toBe(0);
	});
});
