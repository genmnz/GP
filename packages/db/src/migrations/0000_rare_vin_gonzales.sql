CREATE TABLE `classification_results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`image_path` text NOT NULL,
	`true_label` text,
	`pred_label` text NOT NULL,
	`confidence` real NOT NULL,
	`correct` integer NOT NULL,
	`congestion_weight` real NOT NULL,
	`weighted_error` real NOT NULL,
	`score` real NOT NULL,
	`probs_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `classification_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `results_run_idx` ON `classification_results` (`run_id`);--> statement-breakpoint
CREATE INDEX `results_true_label_idx` ON `classification_results` (`true_label`);--> statement-breakpoint
CREATE TABLE `classification_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`dataset` text NOT NULL,
	`model` text NOT NULL,
	`model_version` text DEFAULT 'stub' NOT NULL,
	`total_images` integer DEFAULT 0 NOT NULL,
	`correct` integer DEFAULT 0 NOT NULL,
	`accuracy` real DEFAULT 0 NOT NULL,
	`mean_weighted_error` real DEFAULT 0 NOT NULL,
	`mean_score` real DEFAULT 0 NOT NULL,
	`metrics_json` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`intersection_id` text NOT NULL,
	`type` text NOT NULL,
	`confidence` real NOT NULL,
	`payload_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_intersection_idx` ON `events` (`intersection_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `events_type_idx` ON `events` (`type`);--> statement-breakpoint
CREATE TABLE `inferences` (
	`id` text PRIMARY KEY NOT NULL,
	`intersection_id` text NOT NULL,
	`approach_id` text NOT NULL,
	`traffic_label` text NOT NULL,
	`traffic_confidence` real NOT NULL,
	`accident_detected` integer NOT NULL,
	`accident_confidence` real NOT NULL,
	`ambulance_detected` integer NOT NULL,
	`ambulance_confidence` real NOT NULL,
	`siren_detected` integer NOT NULL,
	`siren_confidence` real NOT NULL,
	`emergency` integer NOT NULL,
	`raw_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inferences_intersection_idx` ON `inferences` (`intersection_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `signal_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`intersection_id` text NOT NULL,
	`cycle` integer NOT NULL,
	`demand` real NOT NULL,
	`preempt_approach_id` text,
	`plan_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `signal_plans_intersection_idx` ON `signal_plans` (`intersection_id`,`created_at`);