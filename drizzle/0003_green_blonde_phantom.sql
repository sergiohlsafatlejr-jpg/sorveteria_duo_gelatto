CREATE TABLE `fin_bank_statements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`bankId` int,
	`categoryId` int,
	`transactionId` int,
	`receivableId` int,
	`date` timestamp NOT NULL,
	`description` varchar(500) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`type` enum('credit','debit') NOT NULL,
	`reconciled` boolean NOT NULL DEFAULT false,
	`paymentMethod` enum('pix','cartao','ted','doc','boleto','dinheiro','cheque','outros'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fin_bank_statements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_banks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`color` varchar(32) NOT NULL DEFAULT '#6366f1',
	`initialBalance` decimal(12,2) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fin_banks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fin_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_costs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`categoryId` int,
	`description` varchar(255) NOT NULL,
	`value` decimal(12,2) NOT NULL,
	`type` enum('fixed','variable') NOT NULL DEFAULT 'fixed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fin_costs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_payment_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`categoryId` int,
	`costId` int,
	`description` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fin_payment_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_receivable_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`description` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fin_receivable_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_receivables` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`clientId` int,
	`typeId` int,
	`description` varchar(500) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`dueDate` timestamp NOT NULL,
	`receivedDate` timestamp,
	`isReceived` boolean NOT NULL DEFAULT false,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fin_receivables_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_revenue_forecasts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`forecastDate` varchar(10) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`actualAmount` decimal(12,2),
	`description` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fin_revenue_forecasts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`categoryId` int,
	`typeId` int,
	`costId` int,
	`bankId` int,
	`description` varchar(500) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`dueDate` timestamp NOT NULL,
	`paymentDate` timestamp,
	`isPaid` boolean NOT NULL DEFAULT false,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fin_transactions_id` PRIMARY KEY(`id`)
);
