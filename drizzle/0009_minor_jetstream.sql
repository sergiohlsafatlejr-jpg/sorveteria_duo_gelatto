CREATE TABLE `instagram_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(20) NOT NULL DEFAULT 'post',
	`caption` text,
	`imageUrl` text,
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`instagramPostId` varchar(100),
	`likes` int DEFAULT 0,
	`reach` int DEFAULT 0,
	`impressions` int DEFAULT 0,
	`comments` int DEFAULT 0,
	`promotionTitle` varchar(200),
	`errorMessage` text,
	`publishedAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `instagram_posts_id` PRIMARY KEY(`id`)
);
