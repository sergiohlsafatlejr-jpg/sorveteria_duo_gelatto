CREATE TABLE `instagram_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cacheKey` varchar(100) NOT NULL,
	`data` json NOT NULL,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `instagram_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `instagram_cache_cacheKey_unique` UNIQUE(`cacheKey`)
);
--> statement-breakpoint
CREATE TABLE `meta_ads_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cacheKey` varchar(100) NOT NULL,
	`data` json NOT NULL,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `meta_ads_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `meta_ads_cache_cacheKey_unique` UNIQUE(`cacheKey`)
);
