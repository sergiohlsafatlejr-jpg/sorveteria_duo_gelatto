CREATE TABLE `product_goals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productName` varchar(200) NOT NULL,
	`searchKeywords` text NOT NULL,
	`targetQuantity` int NOT NULL DEFAULT 0,
	`targetRevenue` decimal(12,2) DEFAULT '0',
	`month` varchar(7) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`icon` varchar(10) DEFAULT '🎯',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_goals_id` PRIMARY KEY(`id`)
);
