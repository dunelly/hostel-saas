import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bedAssignments, beds, rooms, reservations } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { moveAssignmentSchema } from "@/lib/utils/validation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = moveAssignmentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { reservationId, newBedId, singleDate } = parsed.data;

    // Verify the target bed exists and get its room type
    const targetBed = await db
      .select({ id: beds.id, roomId: beds.roomId })
      .from(beds)
      .where(eq(beds.id, newBedId));

    if (targetBed.length === 0) {
      return NextResponse.json({ error: "Target bed not found" }, { status: 404 });
    }

    // Get the assignments to move
    const conditions = [eq(bedAssignments.reservationId, reservationId)];
    if (singleDate) {
      conditions.push(eq(bedAssignments.date, singleDate));
    }

    const toMove = await db
      .select()
      .from(bedAssignments)
      .where(and(...conditions));

    if (toMove.length === 0) {
      return NextResponse.json(
        { error: "No assignments found for this reservation" },
        { status: 404 }
      );
    }

    // Check target bed is free for all required dates (ignore cancelled/no_show)
    for (const assignment of toMove) {
      const conflict = await db
        .select({ id: bedAssignments.id })
        .from(bedAssignments)
        .innerJoin(reservations, eq(bedAssignments.reservationId, reservations.id))
        .where(
          and(
            eq(bedAssignments.bedId, newBedId),
            eq(bedAssignments.date, assignment.date),
            ne(reservations.status, "cancelled"),
            ne(reservations.status, "no_show")
          )
        );
      if (conflict.length > 0) {
        return NextResponse.json(
          {
            error: `Bed ${newBedId} is already occupied on ${assignment.date}`,
          },
          { status: 409 }
        );
      }
    }

    // Move assignments
    for (const assignment of toMove) {
      await db
        .update(bedAssignments)
        .set({ bedId: newBedId, isManual: 1 })
        .where(eq(bedAssignments.id, assignment.id));
    }

    return NextResponse.json({
      moved: toMove.length,
      newBedId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
