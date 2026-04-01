CREATE TABLE `fin_goal_extra_costs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`month` varchar(7) NOT NULL,
	`description` varchar(200) NOT NULL,
	`amount` decimal(12,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fin_goal_extra_costs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_goals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`month` varchar(7) NOT NULL,
	`label` varchar(100) NOT NULL,
	`targetRevenue` decimal(12,2) NOT NULL DEFAULT '0',
	`salary` decimal(12,2) NOT NULL DEFAULT '0',
	`notes` text,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fin_goals_id` PRIMARY KEY(`id`)
);
