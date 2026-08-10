CREATE TABLE `box_stock_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`boxId` int NOT NULL,
	`month` varchar(7) NOT NULL,
	`initialStock` int NOT NULL,
	`entries` int NOT NULL DEFAULT 0,
	`exits` int NOT NULL DEFAULT 0,
	`adjustments` int NOT NULL DEFAULT 0,
	`finalStock` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `box_stock_snapshots_id` PRIMARY KEY(`id`)
);
