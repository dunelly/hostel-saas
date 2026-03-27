import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tours, tourSignups } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tourId = parseInt(id);
  if (isNaN(tourId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  await db.delete(tourSignups).where(eq(tourSignups.tourId, tourId));
  await db.delete(tours).where(eq(tours.id, tourId));
  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tourId = parseInt(id);
  if (isNaN(tourId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.price !== undefined) updates.price = body.price;
  if (body.date !== undefined) updates.date = body.date;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates" }, { status: 400 });
  }

  await db.update(tours).set(updates).where(eq(tours.id, tourId));
  return NextResponse.json({ success: true });
}
