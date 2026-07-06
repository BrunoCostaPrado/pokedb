CREATE TABLE `pokedb_pokedex_card` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`set_name` text NOT NULL,
	`card_number` text NOT NULL,
	`release_year` integer,
	`image_url` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pokedb_post` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text(256),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE INDEX `name_idx` ON `pokedb_post` (`name`);--> statement-breakpoint
CREATE TABLE `pokedb_pokedex_price` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`price` real NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `pokedb_pokedex_card`(`id`) ON UPDATE no action ON DELETE cascade
);
