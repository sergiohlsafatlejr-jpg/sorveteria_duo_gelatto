CREATE TABLE `inove_stock_deduction_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inoveSaleId` int NOT NULL,
	`inoveItemVendaId` int NOT NULL,
	`inoveProductId` int NOT NULL,
	`productName` varchar(255),
	`quantitySold` decimal(10,3) NOT NULL,
	`productId` int,
	`operationalItemId` int,
	`soldAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inove_stock_deduction_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `inove_stock_deduction_log_inoveItemVendaId_unique` UNIQUE(`inoveItemVendaId`)
);
--> statement-breakpoint
ALTER TABLE `operational_items` ADD `inoveProductId` int;--> statement-breakpoint
ALTER TABLE `operational_items` ADD `unitsPerPackage` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `inoveProductId` int;