import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reservations, bedAssignments, beds, rooms } from "@/lib/db/schema";
import { eq, and, desc, gte, lte, inArray } from "drizzle-orm";
import { z } from "zod";
import { eachDayOfInterval, parseISO } from "date-fns";

const schema = z.object({
  reservationId: z.number().int(),
  newCheckOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  additionalPrice: z.number().min(0).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
    }

    const { reservationId, newCheckOut, additionalPrice } = parsed.data;

    const reservation = await db
      .select()
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .get();

    if (!reservation) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }

    if (newCheckOut <= reservation.checkOut) {
      return NextResponse.json(
        { error: `New check-out (${newCheckOut}) must be after current check-out (${reservation.checkOut})` },
        { status: 400 }
      );
    }

    const lastAssignment = await db
      .select()
      .from(bedAssignments)
      .where(eq(bedAssignments.reservationId, reservationId))
      .orderBy(desc(bedAssignments.date))
      .get();

    if (!lastAssignment) {
      return NextResponse.json({ error: "No bed assignment found for this reservation" }, { status: 404 });
    }

    const preferredBedId = lastAssignment.bedId;
    const guestName = lastAssignment.guestName;

    // New nights: from current checkout to new checkout (exclude checkout day)
    const newNights = eachDayOfInterval({
      start: parseISO(reservation.checkOut),
      end: parseISO(newCheckOut),
    }).slice(0, -1);

    const newDateStrs = newNights.map((n) => n.toISOString().split("T")[0]);

    // Check if preferred bed is free for ALL new nights
    let useBedId = preferredBedId;
    let sameBed = true;

    const conflicts = await db
      .select()
      .from(bedAssignments)
      .where(
        and(
          eq(bedAssignments.bedId, preferredBedId),
          gte(bedAssignments.date, newDateStrs[0]),
          lte(bedAssignments.date, newDateStrs[newDateStrs.length - 1])
        )
      );

    const conflictDates = new Set(conflicts.map((c) => c.date));
    const hasConflict = newDateStrs.some((d) => conflictDates.has(d));

    if (hasConflict) {
      // Find an alternative bed in an eligible room
      const altBed = await findFreeBed(reservation.roomTypeReq, newDateStrs);
      if (!altBed) {
        return NextResponse.json(
          { error: `No beds available for the extended nights. All eligible beds are occupied.` },
          { status: 409 }
        );
      }
      useBedId = altBed;
      sameBed = false;
    }

    // Calculate additional price
    const existingNights = Math.round(
      (new Date(reservation.checkOut).getTime() - new Date(reservation.checkIn).getTime()) / 86400000
    );
    const perNightRate =
      reservation.totalPrice && existingNights > 0
        ? reservation.totalPrice / existingNights
        : 0;

    const extraCost = additionalPrice ?? perNightRate * newNights.length;
    const newTotalPrice =
      reservation.totalPrice != null ? reservation.totalPrice + extraCost : null;

    // Create bed assignments for new nights
    for (const dateStr of newDateStrs) {
      await db.insert(bedAssignments).values({
        reservationId,
        bedId: useBedId,
        date: dateStr,
        guestName,
        isManual: 1,
      });
    }

    // Update reservation
    const updateData: Record<string, unknown> = { checkOut: newCheckOut };
    if (newTotalPrice !== null) {
      updateData.totalPrice = newTotalPrice;
      const amountPaid = reservation.amountPaid ?? 0;
      updateData.paymentStatus =
        amountPaid <= 0 ? "unpaid" : amountPaid >= newTotalPrice ? "paid" : "partial";
    }

    await db.update(reservations).set(updateData).where(eq(reservations.id, reservationId));

    return NextResponse.json({
      nightsAdded: newNights.length,
      newCheckOut,
      bedId: useBedId,
      sameBed,
      extraCost,
      newTotalPrice,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Find any free bed in eligible rooms for ALL given dates
async function findFreeBed(roomTypeReq: string, dates: string[]): Promise<string | null> {
  const eligibleRooms = await db
    .select()
    .from(rooms)
    .where(
      roomTypeReq === "female" ? eq(rooms.roomType, "female") : eq(rooms.roomType, "mixed")
    );

  const eligibleRoomIds = eligibleRooms.map((r) => r.id);
  if (eligibleRoomIds.length === 0) return null;

  const allBeds = await db
    .select()
    .from(beds)
    .where(inArray(beds.roomId, eligibleRoomIds));

  // Get all assignments in the date range
  const existing = await db
    .select()
    .from(bedAssignments)
    .where(
      and(
        gte(bedAssignments.date, dates[0]),
        lte(bedAssignments.date, dates[dates.length - 1])
      )
    );

  const occupied = new Set(existing.map((a) => `${a.bedId}:${a.date}`));

  for (const bed of allBeds) {
    const allFree = dates.every((d) => !occupied.has(`${bed.id}:${d}`));
    if (allFree) return bed.id;
  }

  return null;
}
