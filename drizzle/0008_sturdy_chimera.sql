CREATE TABLE `whatsapp_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`segment` varchar(50) NOT NULL DEFAULT 'all',
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`scheduledAt` timestamp,
	`sentAt` timestamp,
	`totalRecipients` int NOT NULL DEFAULT 0,
	`totalSent` int NOT NULL DEFAULT 0,
	`totalFailed` int NOT NULL DEFAULT 0,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`instanceId` varchar(255) NOT NULL,
	`token` varchar(500) NOT NULL,
	`active` boolean NOT NULL DEFAULT false,
	`msgPointsEarned` text,
	`msgGoalNear` text,
	`msgGoalReached` text,
	`msgPromotion` text,
	`notifyOnPoints` boolean NOT NULL DEFAULT true,
	`notifyOnGoalNear` boolean NOT NULL DEFAULT true,
	`notifyOnGoalReached` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int,
	`phone` varchar(20) NOT NULL,
	`type` varchar(30) NOT NULL,
	`message` text NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`campaignId` int,
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsapp_logs_id` PRIMARY KEY(`id`)
);
