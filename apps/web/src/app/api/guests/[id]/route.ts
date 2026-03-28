import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guests, reservations, tourSignups, laundryOrders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET /api/guests/:id — full guest profile with combined totals
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guestId = parseInt(id);
  if (isNaN(guestId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const guest = await db.select().from(guests).where(eq(guests.id, guestId));
  if (guest.length === 0) return NextResponse.json({ error: "Guest not found" }, { status: 404 });

  const guestReservations = await db.select().from(reservations).where(eq(reservations.guestId, guestId));
  const guestTours = await db.select().from(tourSignups).where(eq(tourSignups.guestId, guestId));
  const guestLaundry = await db.select().from(laundryOrders).where(eq(laundryOrders.guestId, guestId));

  // Calculate combined totals
  const roomTotal = guestReservations.reduce((sum, r) => sum + (r.totalPrice || 0), 0);
  const roomPaid = guestReservations.reduce((sum, r) => sum + (r.amountPaid || 0), 0);
  const tourTotal = guestTours.reduce((sum, t) => sum + (t.totalPrice || 0), 0);
  const tourPaid = guestTours.reduce((sum, t) => sum + (t.amountPaid || 0), 0);
  const laundryTotal = guestLaundry.reduce((sum, l) => sum + (l.price || 0), 0);
  const laundryPaid = guestLaundry.reduce((sum, l) => sum + (l.amountPaid || 0), 0);

  return NextResponse.json({
    ...guest[0],
    reservations: guestReservations,
    tours: guestTours,
    laundry: guestLaundry,
    totals: {
      room: { total: roomTotal, paid: roomPaid, owed: roomTotal - roomPaid },
      tours: { total: tourTotal, paid: tourPaid, owed: tourTotal - tourPaid },
      laundry: { total: laundryTotal, paid: laundryPaid, owed: laundryTotal - laundryPaid },
      grand: {
        total: roomTotal + tourTotal + laundryTotal,
        paid: roomPaid + tourPaid + laundryPaid,
        owed: (roomTotal + tourTotal + laundryTotal) - (roomPaid + tourPaid + laundryPaid),
      },
    },
  });
}

// PATCH /api/guests/:id — update guest details (ID, phone, nationality, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guestId = parseInt(id);
  if (isNaN(guestId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.email !== undefined) updates.email = body.email;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.idNumber !== undefined) updates.idNumber = body.idNumber;
  if (body.gender !== undefined) updates.gender = body.gender;
  if (body.nationality !== undefined) updates.nationality = body.nationality;
  if (body.notes !== undefined) updates.notes = body.notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates" }, { status: 400 });
  }

  await db.update(guests).set(updates).where(eq(guests.id, guestId));
  return NextResponse.json({ success: true });
}
