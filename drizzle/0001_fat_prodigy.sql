CREATE TABLE `offer_snapshots` (
	`period` text PRIMARY KEY NOT NULL,
	`generated` text NOT NULL,
	`payload` text NOT NULL,
	`inserted_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_offer_snapshots_generated` ON `offer_snapshots` (`generated`);