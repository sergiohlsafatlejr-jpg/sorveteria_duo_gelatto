ALTER TABLE `products` ADD `purchaseUnit` varchar(20) DEFAULT 'un' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `conversionFactor` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `supplierCode` varchar(100);