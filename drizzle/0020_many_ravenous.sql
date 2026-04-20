CREATE TABLE `customer_purchases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`paymentMethod` enum('cash','credit_card','debit_card','pix','other') NOT NULL,
	`pointsEarned` int NOT NULL DEFAULT 0,
	`notes` text,
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_purchases_id` PRIMARY KEY(`id`)
);
