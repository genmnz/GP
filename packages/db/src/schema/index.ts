import {
	index,
	integer,
	real,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

/** Shared column helpers — keep ids/timestamps consistent across tables. */
const pk = () =>
	text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
	integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date());

/* ------------------------------------------------------------------ *
 * Dataset classification — the offline "feed 10K images, classify,    *
 * run the equation, log everything" flow. Python produces the rows;   *
 * Bun owns the database and the math is persisted here.               *
 * ------------------------------------------------------------------ */

/** One batch run over a labelled dataset (e.g. a 10K ImageFolder). */
export const classificationRuns = sqliteTable("classification_runs", {
	id: pk(),
	dataset: text("dataset").notNull(),
	model: text("model").notNull(),
	modelVersion: text("model_version").notNull().default("stub"),
	totalImages: integer("total_images").notNull().default(0),
	correct: integer("correct").notNull().default(0),
	// aggregate equation outputs (see scoring module)
	accuracy: real("accuracy").notNull().default(0),
	meanWeightedError: real("mean_weighted_error").notNull().default(0),
	meanScore: real("mean_score").notNull().default(0),
	// confusion matrix + per-class metrics, serialized
	metricsJson: text("metrics_json"),
	startedAt: integer("started_at", { mode: "timestamp" }),
	finishedAt: integer("finished_at", { mode: "timestamp" }),
	createdAt: createdAt(),
});

/** Per-image result: AI output + ground-truth label fused into the equation. */
export const classificationResults = sqliteTable(
	"classification_results",
	{
		id: pk(),
		runId: text("run_id")
			.notNull()
			.references(() => classificationRuns.id, { onDelete: "cascade" }),
		imagePath: text("image_path").notNull(),
		trueLabel: text("true_label"), // from the dataset folder; nullable for unlabelled
		predLabel: text("pred_label").notNull(),
		confidence: real("confidence").notNull(),
		// --- equation outputs (computed once, logged forever) ---
		correct: integer("correct", { mode: "boolean" }).notNull(),
		congestionWeight: real("congestion_weight").notNull(), // W[predLabel]
		weightedError: real("weighted_error").notNull(), // |W[pred]-W[true]| / W_max
		score: real("score").notNull(), // confidence * (1 - weightedError)
		probsJson: text("probs_json"), // full softmax distribution
		createdAt: createdAt(),
	},
	(t) => ({
		runIdx: index("results_run_idx").on(t.runId),
		trueIdx: index("results_true_label_idx").on(t.trueLabel),
	}),
);

/* ------------------------------------------------------------------ *
 * Realtime orchestration — the online "frame -> /infer -> engine"     *
 * flow. Every inference and every computed signal plan is logged.     *
 * ------------------------------------------------------------------ */

/** One multi-model inference for a single camera/approach. */
export const inferences = sqliteTable(
	"inferences",
	{
		id: pk(),
		intersectionId: text("intersection_id").notNull(),
		approachId: text("approach_id").notNull(),
		trafficLabel: text("traffic_label").notNull(),
		trafficConfidence: real("traffic_confidence").notNull(),
		accidentDetected: integer("accident_detected", {
			mode: "boolean",
		}).notNull(),
		accidentConfidence: real("accident_confidence").notNull(),
		ambulanceDetected: integer("ambulance_detected", {
			mode: "boolean",
		}).notNull(),
		ambulanceConfidence: real("ambulance_confidence").notNull(),
		sirenDetected: integer("siren_detected", { mode: "boolean" }).notNull(),
		sirenConfidence: real("siren_confidence").notNull(),
		// fused signal: ambulance(vision) || siren(audio)
		emergency: integer("emergency", { mode: "boolean" }).notNull(),
		rawJson: text("raw_json"),
		createdAt: createdAt(),
	},
	(t) => ({
		intersectionIdx: index("inferences_intersection_idx").on(
			t.intersectionId,
			t.createdAt,
		),
	}),
);

/** A signal plan emitted by the engine, with the demand math that produced it. */
export const signalPlans = sqliteTable(
	"signal_plans",
	{
		id: pk(),
		intersectionId: text("intersection_id").notNull(),
		cycle: integer("cycle").notNull(),
		demand: real("demand").notNull(), // normalized demand D in (0,1]
		preemptApproachId: text("preempt_approach_id"),
		planJson: text("plan_json").notNull(), // phases: {approachId, green}[]
		createdAt: createdAt(),
	},
	(t) => ({
		intersectionIdx: index("signal_plans_intersection_idx").on(
			t.intersectionId,
			t.createdAt,
		),
	}),
);

/** Accident / emergency events raised from inferences (drives alerts). */
export const events = sqliteTable(
	"events",
	{
		id: pk(),
		intersectionId: text("intersection_id").notNull(),
		type: text("type", { enum: ["accident", "emergency"] }).notNull(),
		confidence: real("confidence").notNull(),
		payloadJson: text("payload_json"),
		createdAt: createdAt(),
	},
	(t) => ({
		intersectionIdx: index("events_intersection_idx").on(
			t.intersectionId,
			t.createdAt,
		),
		typeIdx: index("events_type_idx").on(t.type),
	}),
);

export type ClassificationRun = typeof classificationRuns.$inferSelect;
export type NewClassificationRun = typeof classificationRuns.$inferInsert;
export type ClassificationResult = typeof classificationResults.$inferSelect;
export type NewClassificationResult = typeof classificationResults.$inferInsert;
export type Inference = typeof inferences.$inferSelect;
export type NewInference = typeof inferences.$inferInsert;
export type SignalPlanRow = typeof signalPlans.$inferSelect;
export type NewSignalPlanRow = typeof signalPlans.$inferInsert;
export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
