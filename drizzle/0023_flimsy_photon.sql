ALTER TABLE `whatsapp_config` ADD `msgWelcome` text;--> statement-breakpoint
ALTER TABLE `whatsapp_config` ADD `msgBirthday` text;--> statement-breakpoint
ALTER TABLE `whatsapp_config` ADD `notifyOnWelcome` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsapp_config` ADD `notifyOnBirthday` boolean DEFAULT true NOT NULL;