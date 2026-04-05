import { NextResponse } from "next/server";
import { seedDatabase } from "@/lib/db/seed";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function createTables() {
  await db.run(sql`CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    room_type TEXT NOT NULL,
    floor INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(sql`CREATE TABLE IF NOT EXISTS beds (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    bed_number INTEGER NOT NULL,
    label TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(sql`CREATE TABLE IF NOT EXISTS guests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    id_number TEXT,
    gender TEXT,
    nationality TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(sql`CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT,
    source TEXT NOT NULL,
    guest_id INTEGER NOT NULL REFERENCES guests(id),
    check_in TEXT NOT NULL,
    check_out TEXT NOT NULL,
    room_type_req TEXT NOT NULL,
    preferred_room_id TEXT,
    num_guests INTEGER NOT NULL DEFAULT 1,
    total_price REAL,
    currency TEXT DEFAULT 'VND',
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    amount_paid REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'confirmed',
    raw_data TEXT,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS unique_external_booking ON reservations(external_id, source)`);

  await db.run(sql`CREATE TABLE IF NOT EXISTS bed_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_id INTEGER NOT NULL REFERENCES reservations(id),
    bed_id TEXT NOT NULL REFERENCES beds(id),
    date TEXT NOT NULL,
    guest_name TEXT NOT NULL,
    is_manual INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS unique_bed_date ON bed_assignments(bed_id, date)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_assignments_date ON bed_assignments(date)`);

  await db.run(sql`CREATE TABLE IF NOT EXISTS tours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    currency TEXT DEFAULT 'VND',
    date TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(sql`CREATE TABLE IF NOT EXISTS tour_signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tour_id INTEGER NOT NULL REFERENCES tours(id),
    guest_id INTEGER NOT NULL REFERENCES guests(id),
    guest_name TEXT NOT NULL,
    num_people INTEGER NOT NULL DEFAULT 1,
    total_price REAL NOT NULL,
    currency TEXT DEFAULT 'VND',
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    amount_paid REAL DEFAULT 0,
    notes TEXT,
    signed_up_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(sql`CREATE TABLE IF NOT EXISTS laundry_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guest_id INTEGER NOT NULL REFERENCES guests(id),
    guest_name TEXT NOT NULL,
    items TEXT,
    weight REAL,
    price REAL NOT NULL,
    currency TEXT DEFAULT 'VND',
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    amount_paid REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    dropped_off_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  )`);

  await db.run(sql`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(sql`CREATE TABLE IF NOT EXISTS import_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    reservations_count INTEGER NOT NULL,
    new_count INTEGER NOT NULL,
    duplicate_count INTEGER NOT NULL,
    error_count INTEGER NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  // Add payment_method column if missing
  await db.run(sql`ALTER TABLE reservations ADD COLUMN payment_method TEXT`).catch(() => {});

  // Staff schedule tables
  await db.run(sql`CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6366f1',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(sql`CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL REFERENCES staff(id),
    date TEXT NOT NULL,
    shift_type TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(sql`CREATE TABLE IF NOT EXISTS days_off (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL REFERENCES staff(id),
    date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

export async function POST() {
  try {
    await createTables();
    await seedDatabase();
    return NextResponse.json({ success: true, message: "Database seeded" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
