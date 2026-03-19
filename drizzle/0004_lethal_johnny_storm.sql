ALTER TABLE `fin_categories` ADD `type` enum('income','expense') DEFAULT 'expense' NOT NULL;--> statement-breakpoint
ALTER TABLE `fin_categories` ADD `color` varchar(32) DEFAULT '#6b7280' NOT NULL;