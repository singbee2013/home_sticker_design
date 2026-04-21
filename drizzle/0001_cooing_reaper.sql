CREATE TABLE `generateTasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`prompt` text NOT NULL,
	`style` varchar(100),
	`targetCount` int NOT NULL,
	`completedCount` int NOT NULL DEFAULT 0,
	`failedCount` int NOT NULL DEFAULT 0,
	`templateIds` json,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generateTasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mockups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`patternId` int NOT NULL,
	`templateId` int NOT NULL,
	`imageUrl` text NOT NULL,
	`fileKey` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mockups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `patterns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`prompt` text NOT NULL,
	`style` varchar(100),
	`imageUrl` text NOT NULL,
	`fileKey` varchar(512),
	`status` enum('generating','completed','failed') NOT NULL DEFAULT 'generating',
	`taskId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `patterns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` enum('wallpaper','kitchen','floor','wall_sticker') NOT NULL,
	`description` text,
	`sceneImageUrl` text NOT NULL,
	`thumbnailUrl` text,
	`overlayConfig` json,
	`isPreset` int NOT NULL DEFAULT 1,
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `templates_id` PRIMARY KEY(`id`)
);
