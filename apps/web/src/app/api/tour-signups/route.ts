import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tourSignups, tours, guests } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

// GET all signups, optionally filtered by tourId or guestId
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tourId = searchParams.get("tourId");
  const guestId = searchParams.get("guestId");

  let query = db.select().from(tourSignups).orderBy(desc(tourSignups.signedUpAt)).$dynamic();

  if (tourId) query = query.where(eq(tourSignups.tourId, parseInt(tourId)));
  if (guestId) query = query.where(eq(tourSignups.guestId, parseInt(guestId)));

  const results = await query;
  return NextResponse.json(results);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tourId, guestId, guestName, numPeople, notes } = body;

    if (!tourId || !guestId || !guestName) {
      return NextResponse.json({ error: "tourId, guestId, and guestName are required" }, { status: 400 });
    }

    // Get tour price to calculate total
    const tour = await db.select().from(tours).where(eq(tours.id, tourId));
    if (tour.length === 0) {
      return NextResponse.json({ error: "Tour not found" }, { status: 404 });
    }

    const people = numPeople || 1;
    const totalPrice = tour[0].price * people;

    const result = await db
      .insert(tourSignups)
      .values({
        tourId,
        guestId,
        guestName,
        numPeople: people,
        totalPrice,
        currency: tour[0].currency || "VND",
        notes,
      })
      .returning();

    return NextResponse.json(result[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
