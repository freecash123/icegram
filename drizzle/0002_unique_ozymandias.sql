CREATE TABLE `iceboxItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('note','link','message','file','task') NOT NULL DEFAULT 'note',
	`title` varchar(180) NOT NULL,
	`body` text,
	`url` text,
	`mediaUrl` text,
	`mediaKey` text,
	`tags` varchar(500),
	`favorite` boolean NOT NULL DEFAULT false,
	`openedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `iceboxItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `iceboxItems` ADD CONSTRAINT `iceboxItems_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `icebox_user_created_idx` ON `iceboxItems` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `icebox_user_favorite_idx` ON `iceboxItems` (`userId`,`favorite`);