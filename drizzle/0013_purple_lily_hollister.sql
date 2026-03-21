CREATE TABLE `forecast_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`avgWeekday` int NOT NULL DEFAULT 2000,
	`avgSaturday` int NOT NULL DEFAULT 5300,
	`avgSundayHoliday` int NOT NULL DEFAULT 8300,
	`rainFactor` varchar(10) NOT NULL DEFAULT '0.7',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `forecast_settings_id` PRIMARY KEY(`id`)
);
