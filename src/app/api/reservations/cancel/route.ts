import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reservations } from "@/lib/db/schema";
import { eq, inArray, and } from "drizzle-orm";

const API_KEY = process.env.IMPORT_API_KEY || "hostel-dev-key";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { externalIds, apiKey } = body;

    if (apiKey !== API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    return NextResponse.json({
      cancelled: foundIds.length,
      notFound: externalIds.length - existing.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
