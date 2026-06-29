import { describe, expect, test } from "bun:test";
import { toApproach } from "../src/ingest/ml-client";
import type { Inference } from "../src/types";

const base: Inference = {
	traffic: { label: "high", confidence: 0.9 },
	accident: { detected: false, confidence: 0.1 },
	ambulance: { detected: false, confidence: 0.1 },
	siren: { detected: false, confidence: 0.1 },
};

describe("toApproach (emergency fusion)", () => {
	test("carries the congestion label", () => {
		expect(toApproach("a1", base).label).toBe("high");
	});

	test("emergency = ambulance(vision) || siren(audio)", () => {
		expect(toApproach("a1", base).emergency).toBe(false);
		expect(
			toApproach("a1", {
				...base,
				ambulance: { detected: true, confidence: 0.8 },
			}).emergency,
		).toBe(true);
		expect(
			toApproach("a1", { ...base, siren: { detected: true, confidence: 0.8 } })
				.emergency,
		).toBe(true);
	});

	test("propagates accident flag", () => {
		expect(
			toApproach("a1", {
				...base,
				accident: { detected: true, confidence: 0.7 },
			}).accident,
		).toBe(true);
	});
});
