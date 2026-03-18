CREATE TABLE `notification_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateId` int,
	`customerId` int,
	`customerName` varchar(255),
	`channel` enum('whatsapp','instagram','meta','email') NOT NULL,
	`message` text NOT NULL,
	`status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('birthday','points_milestone','promotion','custom') NOT NULL,
	`channel` enum('whatsapp','instagram','meta','email') NOT NULL,
	`subject` varchar(255),
	`message` text NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_templates_id` PRIMARY KEY(`id`)
);
