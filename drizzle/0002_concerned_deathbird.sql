CREATE TABLE `flyer_pages` (
	`run_id` text NOT NULL,
	`catalog_id` text NOT NULL,
	`page_offset` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`run_id`, `catalog_id`, `page_offset`)
);
--> statement-breakpoint
CREATE TABLE `flyer_prices` (
	`period` text NOT NULL,
	`chain_key` text NOT NULL,
	`product_key` text NOT NULL,
	`price` real NOT NULL,
	`observed_on` text NOT NULL,
	PRIMARY KEY(`period`, `chain_key`, `product_key`, `price`)
);
--> statement-breakpoint
CREATE INDEX `idx_flyer_prices_date` ON `flyer_prices` (`observed_on`);--> statement-breakpoint
CREATE TABLE `offer_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`status` text NOT NULL,
	`state` text NOT NULL,
	`lease_until` text
);
--> statement-breakpoint
CREATE INDEX `idx_offer_runs_completed` ON `offer_runs` (`completed_at`);