ALTER TABLE `sales_imports` ADD `importMode` enum('monthly','daily') DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_imports` ADD `saleDate` date;