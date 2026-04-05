import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reservations, bedAssignments } from "@/lib/db/schema";
import { eq, and, notInArray, sql } from "drizzle-orm";
import { autoAssign } from "@/lib/services/assignment";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const reservationId = body?.reservationId as number | undefined;

    let idsToAssign: number[];

    const reassignAll = body?.reassignAll === true;
    const reservationIds = body?.reservationIds as number[] | undefined;

    if (reassignAll) {
      // Clear ALL auto-assignments and re-assign everything
      await db.delete(bedAssignments).where(eq(bedAssignments.isManual, 0));
      const all = await db.select({ id: reservations.id }).from(reservations)
        .where(eq(reservations.status, "confirmed"));
      idsToAssign = all.map((r) => r.id);
    } else if (reservationIds?.length) {
      // Re-assign specific reservations: delete their auto-assignments first
      for (const rid of reservationIds) {
        await db.delete(bedAssignments).where(
          and(eq(bedAssignments.reservationId, rid), eq(bedAssignments.isManual, 0))
        );
      }
      idsToAssign = reservationIds;
    } else if (reservationId) {
      // Re-assign a specific reservation: only delete auto assignments, keep manual ones
      await db
        .delete(bedAssignments)
        .where(
          and(
            eq(bedAssignments.reservationId, reservationId),
            eq(bedAssignments.isManual, 0)
          )
        );
      idsToAssign = [reservationId];
    } else {
      // Find all confirmed reservations that have no bed assignments — single query
      const unassigned = await db
        .select({ id: reservations.id })
        .from(reservations)
        .leftJoin(bedAssignments, eq(reservations.id, bedAssignments.reservationId))
        .where(
          and(
            eq(reservations.status, "confirmed"),
            sql`${bedAssignments.id} IS NULL`
          )
        );
      idsToAssign = unassigned.map((r) => r.id);
    }

    if (idsToAssign.length === 0) {
      return NextResponse.json({
        message: "No unassigned reservations found",
        assigned: 0,
        unassigned: 0,
      });
    }

    const result = await autoAssign(idsToAssign);

    return NextResponse.json({
      attempted: idsToAssign.length,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
