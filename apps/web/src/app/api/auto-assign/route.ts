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

    if (reservationId) {
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
      // Find all confirmed reservations that have no bed assignments
      const unassigned = await db
        .select({ id: reservations.id })
        .from(reservations)
        .where(
          eq(reservations.status, "confirmed")
        );

      // Filter to those with no assignments
      const unassignedIds: number[] = [];
      for (const r of unassigned) {
        const assignments = await db
          .select({ id: bedAssignments.id })
          .from(bedAssignments)
          .where(eq(bedAssignments.reservationId, r.id))
          .limit(1);
        if (assignments.length === 0) {
          unassignedIds.push(r.id);
        }
      }
      idsToAssign = unassignedIds;
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
