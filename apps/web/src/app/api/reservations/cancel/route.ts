import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reservations, bedAssignments } from "@/lib/db/schema";
import { eq, inArray, and } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const expectedKey = process.env.IMPORT_API_KEY;
    const providedKey = request.headers.get("x-api-key");
    if (!expectedKey || providedKey !== expectedKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { externalIds } = body;

    if (!Array.isArray(externalIds) || externalIds.length === 0) {
      return NextResponse.json({ error: "externalIds must be a non-empty array" }, { status: 400 });
    }

    // Find matching reservations by externalId
    const existing = await db
      .select({ id: reservations.id, externalId: reservations.externalId })
      .from(reservations)
      .where(inArray(reservations.externalId, externalIds));

    if (existing.length === 0) {
      return NextResponse.json({ cancelled: 0, notFound: externalIds.length });
    }

    const foundIds = existing.map((r) => r.id);

    await db
      .update(reservations)
      .set({ status: "cancelled" })
      .where(inArray(reservations.id, foundIds));

    await db
      .delete(bedAssignments)
      .where(inArray(bedAssignments.reservationId, foundIds));

    return NextResponse.json({
      cancelled: foundIds.length,
      notFound: externalIds.length - existing.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
