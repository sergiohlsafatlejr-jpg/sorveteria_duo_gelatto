CREATE TABLE `sales_import_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`importId` int NOT NULL,
	`externalCode` varchar(100) NOT NULL,
	`externalName` varchar(255) NOT NULL,
	`unit` varchar(20) NOT NULL DEFAULT 'UND',
	`quantity` decimal(10,3) NOT NULL,
	`unitPrice` decimal(10,2) NOT NULL,
	`totalPrice` decimal(12,2) NOT NULL,
	`productId` int,
	`linkStatus` enum('linked','pending','ignored') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_import_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_import_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`importId` int NOT NULL,
	`paymentMethod` varchar(50) NOT NULL,
	`totalAmount` decimal(12,2) NOT NULL,
	`transactionCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_import_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`referenceMonth` varchar(7) NOT NULL,
	`status` enum('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
	`totalRevenue` decimal(12,2) NOT NULL DEFAULT '0',
	`totalItems` int NOT NULL DEFAULT 0,
	`totalTransactions` int NOT NULL DEFAULT 0,
	`linkedItems` int NOT NULL DEFAULT 0,
	`pendingItems` int NOT NULL DEFAULT 0,
	`notes` text,
	`confirmedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_imports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD `externalCode` varchar(100);