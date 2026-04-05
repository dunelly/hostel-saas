import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reservations, bedAssignments } from "@/lib/db/schema";
import { eq, and, ne, desc, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { eachDayOfInterval, parseISO, format } from "date-fns";

const schema = z.object({
  reservationId: z.number().int(),
  newCheckOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetBedId: z.string().optional(),
  additionalPrice: z.number().min(0).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
    }

    const { reservationId, newCheckOut, targetBedId, additionalPrice } = parsed.data;

    const reservation = await db
      .select()
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .get();

    if (!reservation) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }

    if (newCheckOut === reservation.checkOut) {
      return NextResponse.json({ message: "No change" });
    }

    if (newCheckOut <= reservation.checkIn) {
      return NextResponse.json({ error: "Must keep at least one night" }, { status: 400 });
    }

    const existingNights = Math.round(
      (new Date(reservation.checkOut).getTime() - new Date(reservation.checkIn).getTime()) / 86400000
    );
    const perNightRate =
      reservation.totalPrice && existingNights > 0
        ? reservation.totalPrice / existingNights
        : 0;

    // ── SHRINK ──────────────────────────────────────────────
    if (newCheckOut < reservation.checkOut) {
      // Delete assignment rows for nights being removed (date >= newCheckOut)
      await db.delete(bedAssignments).where(
        and(
          eq(bedAssignments.reservationId, reservationId),
          gte(bedAssignments.date, newCheckOut)
        )
      );

      const newNightCount = Math.round(
        (new Date(newCheckOut).getTime() - new Date(reservation.checkIn).getTime()) / 86400000
      );
      const nightsRemoved = existingNights - newNightCount;
      const reducedCost = perNightRate * nightsRemoved;
      const newTotalPrice =
        reservation.totalPrice != null
          ? Math.round((reservation.totalPrice - reducedCost) * 100) / 100
          : null;

      const updateData: Record<string, unknown> = { checkOut: newCheckOut };
      if (newTotalPrice !== null) {
        updateData.totalPrice = newTotalPrice;
        const amountPaid = reservation.amountPaid ?? 0;
        updateData.paymentStatus =
          amountPaid <= 0 ? "unpaid" : amountPaid >= newTotalPrice ? "paid" : "partial";
      }

      await db.update(reservations).set(updateData).where(eq(reservations.id, reservationId));

      return NextResponse.json({ nightsRemoved, newCheckOut, newTotalPrice });
    }

    // ── EXTEND ──────────────────────────────────────────────
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

    const newDateStrs = newNights.map((n) => format(n, "yyyy-MM-dd"));

    const targetBedToUse = targetBedId || preferredBedId;
    const useBedId = targetBedToUse;
    const sameBed = targetBedToUse === preferredBedId;

    const conflicts = await db
      .select({ id: bedAssignments.id, date: bedAssignments.date, status: reservations.status })
      .from(bedAssignments)
      .innerJoin(reservations, eq(bedAssignments.reservationId, reservations.id))
      .where(
        and(
          eq(bedAssignments.bedId, targetBedToUse),
          ne(bedAssignments.reservationId, reservationId),
          gte(bedAssignments.date, newDateStrs[0]),
          lte(bedAssignments.date, newDateStrs[newDateStrs.length - 1])
        )
      );

    const activeConflicts = conflicts.filter((c) => c.status !== "cancelled" && c.status !== "no_show");
    const activeConflictDates = new Set(activeConflicts.map((c) => c.date));
    const hasActiveConflict = newDateStrs.some((d) => activeConflictDates.has(d));

    if (hasActiveConflict) {
      return NextResponse.json(
        { error: `Bed ${targetBedToUse} is occupied for some of the extended nights.` },
        { status: 409 }
      );
    }

    const ghostConflicts = conflicts.filter((c) => c.status === "cancelled" || c.status === "no_show");
    for (const ghost of ghostConflicts) {
      await db.delete(bedAssignments).where(eq(bedAssignments.id, ghost.id));
    }

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
