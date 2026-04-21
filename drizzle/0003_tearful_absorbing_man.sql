CREATE TABLE `productVideos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`patternId` int,
	`mockupIds` json,
	`videoType` enum('tutorial','showcase','selling_points') NOT NULL DEFAULT 'showcase',
	`prompt` text NOT NULL,
	`targetMarket` enum('north_america','europe','southeast_asia','middle_east','south_america','global') DEFAULT 'global',
	`category` enum('wallpaper','kitchen','floor','wall_sticker','bathroom','toilet','window','fridge','ps5','macbook','drone'),
	`videoUrl` text,
	`thumbnailUrl` text,
	`durationSeconds` int,
	`status` enum('pending','generating','completed','failed') NOT NULL DEFAULT 'pending',
	`productCode` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `productVideos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `generateTasks` MODIFY COLUMN `targetCategory` enum('wallpaper','kitchen','floor','wall_sticker','bathroom','toilet','window','fridge','ps5','macbook','drone');--> statement-breakpoint
ALTER TABLE `patterns` MODIFY COLUMN `targetCategory` enum('wallpaper','kitchen','floor','wall_sticker','bathroom','toilet','window','fridge','ps5','macbook','drone');--> statement-breakpoint
ALTER TABLE `templates` MODIFY COLUMN `category` enum('wallpaper','kitchen','floor','wall_sticker','bathroom','toilet','window','fridge','ps5','macbook','drone') NOT NULL;--> statement-breakpoint
ALTER TABLE `generateTasks` ADD `targetMarket` enum('north_america','europe','southeast_asia','middle_east','south_america','global') DEFAULT 'global';--> statement-breakpoint
ALTER TABLE `generateTasks` ADD `generateSeamless` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `mockups` ADD `usedSeamless` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `patterns` ADD `targetMarket` enum('north_america','europe','southeast_asia','middle_east','south_america','global') DEFAULT 'global';--> statement-breakpoint
ALTER TABLE `patterns` ADD `seamlessImageUrl` text;--> statement-breakpoint
ALTER TABLE `patterns` ADD `seamlessStatus` enum('none','processing','completed','failed') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `templates` ADD `targetMarket` enum('north_america','europe','southeast_asia','middle_east','south_america','global') DEFAULT 'global';--> statement-breakpoint
ALTER TABLE `templates` ADD `sceneAngle` enum('front','side_45','overhead','closeup','wide_room','lifestyle') DEFAULT 'front';--> statement-breakpoint
ALTER TABLE `templates` ADD `sceneStyle` varchar(100);