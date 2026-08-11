ALTER TABLE `purchase_invoices` ADD `documentHash` varchar(64);--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD `documentIndex` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoice_document_idx` UNIQUE(`documentHash`,`documentIndex`);