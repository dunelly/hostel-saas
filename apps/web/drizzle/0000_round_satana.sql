CREATE TABLE `bed_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reservation_id` integer NOT NULL,
	`bed_id` text NOT NULL,
	`date` text NOT NULL,
	`guest_name` text NOT NULL,
	`is_manual` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bed_id`) REFERENCES `beds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_bed_date` ON `bed_assignments` (`bed_id`,`date`);--> statement-breakpoint
CREATE TABLE `beds` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`bed_number` integer NOT NULL,
	`label` text,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `guests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`gender` text,
	`notes` text,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `import_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`reservations_count` integer NOT NULL,
	`new_count` integer NOT NULL,
	`duplicate_count` integer NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`imported_at` text DEFAULT '(datetime(''now''))' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text,
	`source` text NOT NULL,
	`guest_id` integer NOT NULL,
	`check_in` text NOT NULL,
	`check_out` text NOT NULL,
	`room_type_req` text NOT NULL,
	`num_guests` integer DEFAULT 1 NOT NULL,
	`total_price` real,
	`currency` text DEFAULT 'EUR',
	`status` text DEFAULT 'confirmed' NOT NULL,
	`raw_data` text,
	`imported_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_external_booking` ON `reservations` (`external_id`,`source`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`capacity` integer NOT NULL,
	`room_type` text NOT NULL,
	`floor` integer,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL
);
