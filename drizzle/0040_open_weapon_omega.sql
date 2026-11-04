CREATE TABLE `box_open_tracking` (
	`id` int AUTO_INCREMENT NOT NULL,
	`boxId` int NOT NULL,
	`accumulatedKg` decimal(10,3) NOT NULL DEFAULT '0',
	`lastOpeningAt` timestamp,
	`lastComputedAt` timestamp,
	`suggestionPending` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `box_open_tracking_id` PRIMARY KEY(`id`),
	CONSTRAINT `box_open_tracking_boxId_unique` UNIQUE(`boxId`)
);
--> statement-breakpoint
ALTER TABLE `box_stock` ADD `rendimentoKg` decimal(6,2);