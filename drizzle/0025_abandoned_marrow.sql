CREATE TABLE `inove_sales_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cacheKey` varchar(50) NOT NULL,
	`data` text NOT NULL,
	`updatedAt` int NOT NULL,
	CONSTRAINT `inove_sales_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `inove_sales_cache_cacheKey_unique` UNIQUE(`cacheKey`)
);
