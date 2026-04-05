import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bedAssignments, beds, rooms, reservations, guests, importLog } from "@/lib/db/schema";
import { and, gte, lte, eq, desc, count, sql } from "drizzle-orm";
import { eachDayOfInterval, parseISO, format } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "Missing 'from' and 'to' query params" },
        { status: 400 }
      );
    }

    // Total rooms and beds
    const allRooms = await db.select().from(rooms);
    const totalRooms = allRooms.length;
    const allBeds = await db.select().from(beds);
    const totalBeds = allBeds.length;

    // Occupancy by date
    const dates = eachDayOfInterval({
      start: parseISO(from),
      end: parseISO(to),
    }).map((d) => format(d, "yyyy-MM-dd"));

    const assignments = await db
      .select()
      .from(bedAssignments)
      .where(
        and(
          gte(bedAssignments.date, from),
          lte(bedAssignments.date, to)
        )
      );

    const occupancyByDate = dates.map((date) => {
      const occupied = assignments.filter((a) => a.date === date).length;
      return {
        date,
        occupied,
        total: totalBeds,
        percentage: Math.round((occupied / totalBeds) * 100),
      };
    });

    // Recent imports
    const recentImports = await db
      .select()
      .from(importLog)
      .orderBy(desc(importLog.importedAt))
      .limit(5);

    // Unassigned count — single query with LEFT JOIN instead of N+1
    const unassignedResult = await db
      .select({ count: count() })
      .from(reservations)
      .leftJoin(bedAssignments, eq(reservations.id, bedAssignments.reservationId))
      .where(
        and(
          eq(reservations.status, "confirmed"),
          sql`${bedAssignments.id} IS NULL`
        )
      );
    const unassignedCount = unassignedResult[0]?.count ?? 0;

    // Today's arrivals, departures, unpaid
    const today = format(new Date(), "yyyy-MM-dd");

    const todayArrivals = await db
      .select({
        id: reservations.id,
        guestId: reservations.guestId,
        guestName: guests.name,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        status: reservations.status,
        paymentStatus: reservations.paymentStatus,
        totalPrice: reservations.totalPrice,
        amountPaid: reservations.amountPaid,
        source: reservations.source,
      })
      .from(reservations)
      .innerJoin(guests, eq(reservations.guestId, guests.id))
      .where(
        and(
          eq(reservations.checkIn, today),
          sql`${reservations.status} IN ('confirmed', 'checked_in')`
        )
      );

    // Get bed assignments for arrivals
    for (const arrival of todayArrivals) {
      const bed = await db
        .select({ bedId: bedAssignments.bedId })
        .from(bedAssignments)
        .where(eq(bedAssignments.reservationId, arrival.id))
        .limit(1);
      (arrival as Record<string, unknown>).bedId = bed[0]?.bedId ?? null;
    }

    const todayDepartures = await db
      .select({
        id: reservations.id,
        guestId: reservations.guestId,
        guestName: guests.name,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        status: reservations.status,
        paymentStatus: reservations.paymentStatus,
        totalPrice: reservations.totalPrice,
        amountPaid: reservations.amountPaid,
        source: reservations.source,
      })
      .from(reservations)
      .innerJoin(guests, eq(reservations.guestId, guests.id))
      .where(
        and(
          eq(reservations.checkOut, today),
          sql`${reservations.status} IN ('checked_in', 'checked_out')`
        )
      );

    for (const dep of todayDepartures) {
      const bed = await db
        .select({ bedId: bedAssignments.bedId })
        .from(bedAssignments)
        .where(eq(bedAssignments.reservationId, dep.id))
        .limit(1);
      (dep as Record<string, unknown>).bedId = bed[0]?.bedId ?? null;
    }

    const unpaidInHouse = await db
      .select({
        id: reservations.id,
        guestId: reservations.guestId,
        guestName: guests.name,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        status: reservations.status,
        paymentStatus: reservations.paymentStatus,
        totalPrice: reservations.totalPrice,
        amountPaid: reservations.amountPaid,
        source: reservations.source,
      })
      .from(reservations)
      .innerJoin(guests, eq(reservations.guestId, guests.id))
      .where(
        and(
          eq(reservations.status, "checked_in"),
          sql`${reservations.paymentStatus} != 'paid'`
        )
      );

    for (const guest of unpaidInHouse) {
      const bed = await db
        .select({ bedId: bedAssignments.bedId })
        .from(bedAssignments)
        .where(eq(bedAssignments.reservationId, guest.id))
        .limit(1);
      (guest as Record<string, unknown>).bedId = bed[0]?.bedId ?? null;
    }

    return NextResponse.json({
      totalBeds,
      totalRooms,
      occupancyByDate,
      recentImports,
      unassignedCount,
      todayArrivals,
      todayDepartures,
      unpaidInHouse,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
