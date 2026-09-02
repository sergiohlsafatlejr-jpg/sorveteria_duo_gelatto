ALTER TABLE `purchase_invoices` ADD `operationNature` varchar(30);--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoice_access_key_idx` UNIQUE(`accessKey`);
