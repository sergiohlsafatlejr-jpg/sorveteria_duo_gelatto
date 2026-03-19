CREATE TABLE `fin_daily_revenue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`revenueDate` varchar(10) NOT NULL,
	`realAmount` decimal(12,2) NOT NULL,
	`note` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fin_daily_revenue_id` PRIMARY KEY(`id`)
);
