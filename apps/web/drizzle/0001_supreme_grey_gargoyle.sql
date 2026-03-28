ALTER TABLE `reservations` ADD `payment_status` text DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE `reservations` ADD `amount_paid` real DEFAULT 0;