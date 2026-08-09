CREATE TABLE `operational_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` enum('limpeza','guloseimas','caldas','descartaveis','embalagens','manutencao','insumos') NOT NULL,
	`unit` varchar(20) NOT NULL DEFAULT 'un',
	`currentStock` decimal(10,2) NOT NULL DEFAULT '0',
	`minStock` decimal(10,2) NOT NULL DEFAULT '0',
	`referencePrice` decimal(10,2),
	`preferredSupplierId` int,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operational_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operational_stock_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`type` enum('in','consumption','loss','adjustment') NOT NULL,
	`quantity` decimal(10,2) NOT NULL,
	`previousStock` decimal(10,2) NOT NULL,
	`newStock` decimal(10,2) NOT NULL,
	`reason` varchar(255),
	`purchaseOrderId` int,
	`unitCost` decimal(10,2),
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operational_stock_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operational_suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(20),
	`whatsapp` varchar(20),
	`email` varchar(320),
	`cnpj` varchar(20),
	`categories` json,
	`deliveryDays` int,
	`paymentTerms` varchar(100),
	`notes` text,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operational_suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_order_items_op` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`itemId` int NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`quantity` decimal(10,2) NOT NULL,
	`unit` varchar(20) NOT NULL,
	`estimatedUnitPrice` decimal(10,2),
	`actualUnitPrice` decimal(10,2),
	`estimatedTotal` decimal(12,2),
	`actualTotal` decimal(12,2),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchase_order_items_op_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(20) NOT NULL,
	`status` enum('draft','requested','approved','rejected','purchased','delivered') NOT NULL DEFAULT 'draft',
	`requestedBy` int,
	`approvedBy` int,
	`supplierId` int,
	`totalEstimated` decimal(12,2) DEFAULT '0',
	`totalActual` decimal(12,2),
	`notes` text,
	`rejectionReason` text,
	`requestedAt` timestamp,
	`approvedAt` timestamp,
	`purchasedAt` timestamp,
	`deliveredAt` timestamp,
	`templateId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchase_orders_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `purchase_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(50),
	`items` json,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_templates_id` PRIMARY KEY(`id`)
);
