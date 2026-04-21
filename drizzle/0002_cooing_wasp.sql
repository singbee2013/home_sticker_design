ALTER TABLE `templates` MODIFY COLUMN `category` enum('wallpaper','kitchen','floor','wall_sticker','bathroom','window','fridge','ps5','macbook','drone') NOT NULL;--> statement-breakpoint
ALTER TABLE `generateTasks` ADD `outputMode` varchar(32) DEFAULT 'both';--> statement-breakpoint
ALTER TABLE `generateTasks` ADD `targetCategory` enum('wallpaper','kitchen','floor','wall_sticker','bathroom','window','fridge','ps5','macbook','drone');--> statement-breakpoint
ALTER TABLE `generateTasks` ADD `targetSizeId` varchar(64);--> statement-breakpoint
ALTER TABLE `generateTasks` ADD `referenceImageUrl` text;--> statement-breakpoint
ALTER TABLE `mockups` ADD `productCode` varchar(64);--> statement-breakpoint
ALTER TABLE `patterns` ADD `productCode` varchar(64);--> statement-breakpoint
ALTER TABLE `patterns` ADD `targetCategory` enum('wallpaper','kitchen','floor','wall_sticker','bathroom','window','fridge','ps5','macbook','drone');--> statement-breakpoint
ALTER TABLE `patterns` ADD `targetSizeId` varchar(64);--> statement-breakpoint
ALTER TABLE `patterns` ADD `tileImageUrl` text;--> statement-breakpoint
ALTER TABLE `patterns` ADD `referenceImageUrl` text;