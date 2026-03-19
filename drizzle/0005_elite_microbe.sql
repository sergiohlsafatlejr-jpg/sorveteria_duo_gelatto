ALTER TABLE `fin_costs` MODIFY COLUMN `description` varchar(255);--> statement-breakpoint
ALTER TABLE `fin_costs` MODIFY COLUMN `value` decimal(12,2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `fin_costs` ADD `name` varchar(255) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `fin_costs` ADD `amount` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `fin_costs` ADD `recurrence` enum('monthly','weekly','yearly','once') DEFAULT 'monthly';--> statement-breakpoint
ALTER TABLE `fin_costs` ADD `dueDay` int DEFAULT 1;