import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bedAssignments } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const schema = z.object({
  reservationIdA: z.number().int(),
  reservationIdB: z.number().int(),
  bedIdA: z.string(),
  bedIdB: z.string(),
  singleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
    }

    const { reservationIdA, reservationIdB, bedIdA, bedIdB, singleDate } = parsed.data;

    if (bedIdA === bedIdB) {
      return NextResponse.json({ error: "Guests are already on the same bed" }, { status: 400 });
    }

    // Get assignments for both reservations
    const conditionsA = [eq(bedAssignments.reservationId, reservationIdA), eq(bedAssignments.bedId, bedIdA)];
    const conditionsB = [eq(bedAssignments.reservationId, reservationIdB), eq(bedAssignments.bedId, bedIdB)];

    if (singleDate) {
      conditionsA.push(eq(bedAssignments.date, singleDate));
      conditionsB.push(eq(bedAssignments.date, singleDate));
    }

    const assignmentsA = await db.select().from(bedAssignments).where(and(...conditionsA));
    const assignmentsB = await db.select().from(bedAssignments).where(and(...conditionsB));

    if (assignmentsA.length === 0 || assignmentsB.length === 0) {
      return NextResponse.json({ error: "Assignments not found for one or both guests" }, { status: 404 });
    }

    // Find overlapping dates to swap
    const datesA = new Set(assignmentsA.map((a) => a.date));
    const datesB = new Set(assignmentsB.map((a) => a.date));
    const overlapDates = [...datesA].filter((d) => datesB.has(d));

    if (overlapDates.length === 0) {
      return NextResponse.json({ error: "No overlapping dates to swap" }, { status: 400 });
    }

    // Swap: A's assignments on overlap dates go to bedB, B's go to bedA
    // Use a temp bedId to avoid unique constraint violations during swap
    const tempBed = `__swap_temp_${Date.now()}`;

    for (const date of overlapDates) {
      const aAssign = assignmentsA.find((a) => a.date === date);
      const bAssign = assignmentsB.find((a) => a.date === date);
      if (!aAssign || !bAssign) continue;

      // Move A to temp
      await db.update(bedAssignments).set({ bedId: tempBed }).where(eq(bedAssignments.id, aAssign.id));
      // Move B to A's bed
      await db.update(bedAssignments).set({ bedId: bedIdA, isManual: 1 }).where(eq(bedAssignments.id, bAssign.id));
      // Move A from temp to B's bed
      await db.update(bedAssignments).set({ bedId: bedIdB, isManual: 1 }).where(eq(bedAssignments.id, aAssign.id));
    }

    // Also swap non-overlapping dates (full stay swap)
    if (!singleDate) {
      const onlyA = assignmentsA.filter((a) => !datesB.has(a.date));
      const onlyB = assignmentsB.filter((a) => !datesA.has(a.date));

      for (const a of onlyA) {
        await db.update(bedAssignments).set({ bedId: bedIdB, isManual: 1 }).where(eq(bedAssignments.id, a.id));
      }
      for (const b of onlyB) {
        await db.update(bedAssignments).set({ bedId: bedIdA, isManual: 1 }).where(eq(bedAssignments.id, b.id));
      }
    }

    return NextResponse.json({
      swapped: overlapDates.length,
      bedIdA,
      bedIdB,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
