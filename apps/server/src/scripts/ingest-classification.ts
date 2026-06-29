/**
 * Ingest a batch-classification run produced by the Python ML service into
 * bun:sqlite. Python does the ML + math and writes files; Bun owns the DB.
 *
 *   bun run src/scripts/ingest-classification.ts <run-dir>
 *
 * <run-dir> must contain:
 *   - metrics.json   (aggregate equation outputs)
 *   - results.jsonl  (one per-image line: AI output + label fused into the equation)
 */
import { classificationResults, classificationRuns, db } from "@ziko/db";

interface Metrics {
	dataset: string;
	model: string;
	model_version?: string;
	total_images: number;
	correct: number;
	accuracy: number;
	mean_weighted_error: number;
	mean_score: number;
	started_at?: string;
	finished_at?: string;
	[k: string]: unknown;
}

interface ResultLine {
	image_path: string;
	true_label: string | null;
	pred_label: string;
	confidence: number;
	correct: boolean;
	congestion_weight: number;
	weighted_error: number;
	score: number;
	probs?: Record<string, number>;
}

const runDir = process.argv[2];
if (!runDir) {
	console.error(
		"usage: bun run src/scripts/ingest-classification.ts <run-dir>",
	);
	process.exit(1);
}

const metrics = (await Bun.file(`${runDir}/metrics.json`).json()) as Metrics;

const [run] = await db
	.insert(classificationRuns)
	.values({
		dataset: metrics.dataset,
		model: metrics.model,
		modelVersion: metrics.model_version ?? "stub",
		totalImages: metrics.total_images,
		correct: metrics.correct,
		accuracy: metrics.accuracy,
		meanWeightedError: metrics.mean_weighted_error,
		meanScore: metrics.mean_score,
		metricsJson: JSON.stringify(metrics),
		startedAt: metrics.started_at ? new Date(metrics.started_at) : null,
		finishedAt: metrics.finished_at ? new Date(metrics.finished_at) : null,
	})
	.returning();

if (!run) throw new Error("failed to insert classification run");

const text = await Bun.file(`${runDir}/results.jsonl`).text();
const rows = text
	.split("\n")
	.filter((l) => l.trim())
	.map((line) => {
		const r = JSON.parse(line) as ResultLine;
		return {
			runId: run.id,
			imagePath: r.image_path,
			trueLabel: r.true_label,
			predLabel: r.pred_label,
			confidence: r.confidence,
			correct: r.correct,
			congestionWeight: r.congestion_weight,
			weightedError: r.weighted_error,
			score: r.score,
			probsJson: r.probs ? JSON.stringify(r.probs) : null,
		};
	});

// Insert in chunks (SQLite has a variable limit per statement).
const CHUNK = 500;
for (let i = 0; i < rows.length; i += CHUNK) {
	await db.insert(classificationResults).values(rows.slice(i, i + CHUNK));
}

console.log(
	`ingested run ${run.id}: ${rows.length} results, accuracy=${metrics.accuracy.toFixed(4)}, ` +
		`mean_weighted_error=${metrics.mean_weighted_error.toFixed(4)}, mean_score=${metrics.mean_score.toFixed(4)}`,
);
