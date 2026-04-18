ALTER TABLE `sales_imports` ADD `archived` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_imports` ADD `archivedAt` timestamp;