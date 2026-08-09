CREATE TABLE `box_stock` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`inoveProductId` int,
	`costPrice` decimal(10,2) DEFAULT '0',
	`currentStock` int NOT NULL DEFAULT 0,
	`minStock` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `box_stock_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `box_stock_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`boxId` int NOT NULL,
	`type` enum('entrada','saida') NOT NULL,
	`quantity` int NOT NULL,
	`previousStock` int NOT NULL,
	`newStock` int NOT NULL,
	`notes` varchar(500),
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `box_stock_movements_id` PRIMARY KEY(`id`)
);
