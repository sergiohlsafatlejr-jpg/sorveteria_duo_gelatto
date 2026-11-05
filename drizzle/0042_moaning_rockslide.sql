CREATE TABLE `stock_scheduled_jobs` (
	`jobKey` enum('stock-deduction','box-dia','box-noite') NOT NULL,
	`schedule_cron_task_uid` varchar(65),
	`enabled` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stock_scheduled_jobs_jobKey` PRIMARY KEY(`jobKey`),
	CONSTRAINT `stock_scheduled_jobs_task_uid_idx` UNIQUE(`schedule_cron_task_uid`)
);
