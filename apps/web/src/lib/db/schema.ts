import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(), // e.g. "1A", "2A", "4B"
  name: text("name").notNull(), // e.g. "ROOM 1A"
  capacity: integer("capacity").notNull(), // 8 or 10
  roomType: text("room_type").notNull(), // "mixed" | "female"
  floor: integer("floor"),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
});

export const beds = sqliteTable("beds", {
  id: text("id").primaryKey(), // e.g. "1A-01"
  roomId: text("room_id")
    .notNull()
    .references(() => rooms.id),
  bedNumber: integer("bed_number").notNull(),
  label: text("label"), // "Top Bunk", "Bottom Bunk"
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
});

export const guests = sqliteTable("guests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  idNumber: text("id_number"), // passport or national ID
  gender: text("gender"), // "male" | "female" | "other"
  nationality: text("nationality"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
});

export const reservations = sqliteTable(
  "reservations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    externalId: text("external_id"),
    source: text("source").notNull(), // "booking.com" | "hostelworld" | "manual"
    guestId: integer("guest_id")
      .notNull()
      .references(() => guests.id),
    checkIn: text("check_in").notNull(), // ISO date
    checkOut: text("check_out").notNull(), // ISO date
    roomTypeReq: text("room_type_req").notNull(), // "mixed" | "female"
    preferredRoomId: text("preferred_room_id"), // e.g. "1A", "3A,3B" — from OTA room type name
    numGuests: integer("num_guests").notNull().default(1),
    totalPrice: real("total_price"),
    currency: text("currency").default("VND"),
    paymentStatus: text("payment_status").notNull().default("unpaid"), // "paid" | "unpaid" | "partial" | "refunded"
    amountPaid: real("amount_paid").default(0),
    paymentMethod: text("payment_method"), // "cash" | "card" | "transfer" | null
    status: text("status").notNull().default("confirmed"),
    rawData: text("raw_data"), // JSON blob
    importedAt: text("imported_at").notNull().default("(datetime('now'))"),
    createdAt: text("created_at").notNull().default("(datetime('now'))"),
  },
  (table) => [
    uniqueIndex("unique_external_booking").on(table.externalId, table.source),
  ]
);

export const bedAssignments = sqliteTable(
  "bed_assignments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reservationId: integer("reservation_id")
      .notNull()
      .references(() => reservations.id),
    bedId: text("bed_id")
      .notNull()
      .references(() => beds.id),
    date: text("date").notNull(), // specific night ISO date
    guestName: text("guest_name").notNull(),
    isManual: integer("is_manual").notNull().default(0),
    createdAt: text("created_at").notNull().default("(datetime('now'))"),
  },
  (table) => [
    uniqueIndex("unique_bed_date").on(table.bedId, table.date),
    index("idx_assignments_date").on(table.date),
  ]
);

// ─── Tours ────────────────────────────────────────────────────────────────────
export const tours = sqliteTable("tours", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // e.g. "Ha Long Bay Day Trip"
  description: text("description"),
  price: real("price").notNull(), // per person
  currency: text("currency").default("VND"),
  date: text("date"), // ISO date, null = recurring
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
});

export const tourSignups = sqliteTable("tour_signups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tourId: integer("tour_id")
    .notNull()
    .references(() => tours.id),
  guestId: integer("guest_id")
    .notNull()
    .references(() => guests.id),
  guestName: text("guest_name").notNull(), // denormalized for quick display
  numPeople: integer("num_people").notNull().default(1),
  totalPrice: real("total_price").notNull(), // price × numPeople
  currency: text("currency").default("VND"),
  paymentStatus: text("payment_status").notNull().default("unpaid"), // "paid" | "unpaid" | "partial"
  amountPaid: real("amount_paid").default(0),
  notes: text("notes"),
  signedUpAt: text("signed_up_at").notNull().default("(datetime('now'))"),
});

// ─── Laundry ──────────────────────────────────────────────────────────────────
export const laundryOrders = sqliteTable("laundry_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guestId: integer("guest_id")
    .notNull()
    .references(() => guests.id),
  guestName: text("guest_name").notNull(), // denormalized
  items: text("items"), // description, e.g. "3 shirts, 2 pants"
  weight: real("weight"), // kg
  price: real("price").notNull(),
  currency: text("currency").default("VND"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  amountPaid: real("amount_paid").default(0),
  status: text("status").notNull().default("pending"), // "pending" | "washing" | "done" | "collected"
  droppedOffAt: text("dropped_off_at").notNull().default("(datetime('now'))"),
  completedAt: text("completed_at"),
});

// ─── Staff Schedule ──────────────────────────────────────────────────────────
export const staff = sqliteTable("staff", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"), // display color
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
});

export const shifts = sqliteTable("shifts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffId: integer("staff_id")
    .notNull()
    .references(() => staff.id),
  date: text("date").notNull(), // ISO date
  shiftType: text("shift_type").notNull(), // "morning" | "afternoon" | "evening"
  note: text("note"), // e.g. "FML dinner"
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
});

export const daysOff = sqliteTable("days_off", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffId: integer("staff_id")
    .notNull()
    .references(() => staff.id),
  date: text("date").notNull(),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
});

// Key-value store for app settings (Gmail OAuth token, etc.)
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default("(datetime('now'))"),
});

export const importLog = sqliteTable("import_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  reservationsCount: integer("reservations_count").notNull(),
  newCount: integer("new_count").notNull(),
  duplicateCount: integer("duplicate_count").notNull(),
  errorCount: integer("error_count").notNull().default(0),
  importedAt: text("imported_at").notNull().default("(datetime('now'))"),
});
