ALTER TABLE `stock_movements` ADD `purchaseDate` timestamp;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `supplier` varchar(255);--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `unitCost` decimal(10,2);