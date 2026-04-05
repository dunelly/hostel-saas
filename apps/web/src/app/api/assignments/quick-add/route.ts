import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guests, reservations, bedAssignments, beds } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { z } from "zod";
import { eachDayOfInterval, parseISO, format } from "date-fns";

const schema = z.object({
  guestName: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bedId: z.string().min(1),
  numGuests: z.number().int().min(1).default(1),
  totalPrice: z.number().min(0).optional(),
  currency: z.string().default("VND"),
  roomTypeReq: z.enum(["mixed", "female"]).default("mixed"),
  paymentStatus: z.enum(["paid", "unpaid", "partial"]).default("unpaid"),
  amountPaid: z.number().min(0).optional(),
  phone: z.string().optional(),
  nationality: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
    }

    const { guestName, checkIn, checkOut, bedId, numGuests, totalPrice, currency, roomTypeReq, paymentStatus, amountPaid, phone, nationality } = parsed.data;

    if (checkIn >= checkOut) {
      return NextResponse.json({ error: "Check-out must be after check-in" }, { status: 400 });
    }

    // Verify bed exists
    const bed = await db.select().from(beds).where(eq(beds.id, bedId)).get();
    if (!bed) {
      return NextResponse.json({ error: "Bed not found" }, { status: 404 });
    }

    // Check all nights are free (ignore cancelled/no_show)
    const nights = eachDayOfInterval({ start: parseISO(checkIn), end: parseISO(checkOut) }).slice(0, -1);
    for (const night of nights) {
      const dateStr = format(night, "yyyy-MM-dd");
      const conflict = await db
        .select({ id: bedAssignments.id })
        .from(bedAssignments)
        .innerJoin(reservations, eq(bedAssignments.reservationId, reservations.id))
        .where(
          and(
            eq(bedAssignments.bedId, bedId),
            eq(bedAssignments.date, dateStr),
            ne(reservations.status, "cancelled"),
            ne(reservations.status, "no_show")
          )
        )
        .get();
      if (conflict) {
        return NextResponse.json({ error: `Bed ${bedId} is already occupied on ${dateStr}` }, { status: 409 });
      }
    }

    // Create or reuse guest
    let guestId: number;
    const existing = await db.select().from(guests).where(eq(guests.name, guestName)).get();
    if (existing) {
      guestId = existing.id;
    } else {
      const inserted = await db.insert(guests).values({
        name: guestName,
        ...(phone ? { phone } : {}),
        ...(nationality ? { nationality } : {}),
      }).returning({ id: guests.id });
      guestId = inserted[0].id;
    }

    // Create reservation
    const res = await db
      .insert(reservations)
      .values({
        source: "manual",
        guestId,
        checkIn,
        checkOut,
        roomTypeReq,
        numGuests,
        totalPrice: totalPrice ?? null,
        currency,
        paymentStatus,
        amountPaid: amountPaid ?? 0,
        status: "confirmed",
      })
      .returning({ id: reservations.id });

    const reservationId = res[0].id;

    // Assign to specific bed for each night
    for (const night of nights) {
      const dateStr = format(night, "yyyy-MM-dd");
      await db.insert(bedAssignments).values({
        reservationId,
        bedId,
        date: dateStr,
        guestName,
        isManual: 1,
      });
    }

    return NextResponse.json({ reservationId, nights: nights.length, bedId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
