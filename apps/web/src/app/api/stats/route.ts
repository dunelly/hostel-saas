import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bedAssignments, beds, rooms, reservations, importLog } from "@/lib/db/schema";
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

    // Total beds
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

    // Unassigned count
    const confirmed = await db
      .select({ id: reservations.id })
      .from(reservations)
      .where(eq(reservations.status, "confirmed"));

    let unassignedCount = 0;
    for (const r of confirmed) {
      const a = await db
        .select({ id: bedAssignments.id })
        .from(bedAssignments)
        .where(eq(bedAssignments.reservationId, r.id))
        .limit(1);
      if (a.length === 0) unassignedCount++;
    }

    return NextResponse.json({
      totalBeds,
      occupancyByDate,
      recentImports,
      unassignedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
