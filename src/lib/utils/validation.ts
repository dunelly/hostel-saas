import { z } from "zod";

export const reservationImportSchema = z.object({
  externalId: z.string(),
  source: z.enum(["booking.com", "hostelworld"]),
  guestName: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  roomTypeReq: z.enum(["mixed", "female"]),
  preferredRoom: z.string().optional(), // e.g. "1A", "3A,3B"
  numGuests: z.number().int().min(1).default(1),
  totalPrice: z.number().optional(),
  currency: z.string().optional(),
  rawHtml: z.string().optional(),
});

export const importRequestSchema = z.object({
  reservations: z.array(reservationImportSchema).min(1),
  apiKey: z.string().optional(),
});

export const manualReservationSchema = z.object({
  guestName: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  roomTypeReq: z.enum(["mixed", "female"]),
  numGuests: z.number().int().min(1).default(1),
  email: z.string().email().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  notes: z.string().optional(),
});

export const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const moveAssignmentSchema = z.object({
  reservationId: z.number().int(),
  newBedId: z.string(),
  singleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // if set, move only this date
});
