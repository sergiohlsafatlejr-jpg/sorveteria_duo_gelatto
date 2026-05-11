CREATE TABLE `cron_job_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobName` varchar(100) NOT NULL,
	`status` enum('success','error','skipped') NOT NULL,
	`message` text,
	`executedAt` timestamp NOT NULL DEFAULT (now()),
	`durationMs` int,
	CONSTRAINT `cron_job_log_id` PRIMARY KEY(`id`)
);
