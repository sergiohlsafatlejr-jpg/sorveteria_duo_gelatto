CREATE TABLE `customer_loyalty_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`token` varchar(64) NOT NULL,
	`lastAccessedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_loyalty_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_loyalty_tokens_customerId_unique` UNIQUE(`customerId`),
	CONSTRAINT `customer_loyalty_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `inove_connector_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`host` varchar(255) NOT NULL,
	`port` int NOT NULL DEFAULT 3306,
	`database` varchar(100) NOT NULL,
	`username` varchar(100) NOT NULL,
	`password` varchar(255) NOT NULL,
	`active` boolean NOT NULL DEFAULT false,
	`lastSyncAt` timestamp,
	`lastSyncStatus` enum('success','error','pending') DEFAULT 'pending',
	`lastSyncMessage` text,
	`syncIntervalMinutes` int NOT NULL DEFAULT 5,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inove_connector_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inove_sync_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`status` enum('success','error') NOT NULL,
	`salesFound` int NOT NULL DEFAULT 0,
	`salesProcessed` int NOT NULL DEFAULT 0,
	`customersLinked` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inove_sync_log_id` PRIMARY KEY(`id`)
);
