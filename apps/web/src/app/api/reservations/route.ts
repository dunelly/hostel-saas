import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reservations, guests, bedAssignments } from "@/lib/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { manualReservationSchema } from "@/lib/utils/validation";
import { autoAssign } from "@/lib/services/assignment";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const status = searchParams.get("status");

    const conditions = [];
    if (from) conditions.push(gte(reservations.checkIn, from));
    if (to) conditions.push(lte(reservations.checkIn, to));
    if (status) conditions.push(eq(reservations.status, status));

    const result = await db
      .select({
        id: reservations.id,
        externalId: reservations.externalId,
        source: reservations.source,
        guestId: reservations.guestId,
        guestName: guests.name,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        roomTypeReq: reservations.roomTypeReq,
        numGuests: reservations.numGuests,
        totalPrice: reservations.totalPrice,
        currency: reservations.currency,
        paymentStatus: reservations.paymentStatus,
        amountPaid: reservations.amountPaid,
        status: reservations.status,
        importedAt: reservations.importedAt,
      })
      .from(reservations)
      .innerJoin(guests, eq(reservations.guestId, guests.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reservations.checkIn));

    // Add bed assignment info
    const resIds = result.map((r) => r.id);
    const allAssignments = resIds.length > 0
      ? await db
          .select({ reservationId: bedAssignments.reservationId, bedId: bedAssignments.bedId })
          .from(bedAssignments)
          .where(eq(bedAssignments.date, result[0]?.checkIn || ""))
      : [];

    // Build a map: reservationId -> first bedId
    const bedMap = new Map<number, string>();
    for (const a of allAssignments) {
      if (!bedMap.has(a.reservationId)) bedMap.set(a.reservationId, a.bedId);
    }

    // Fallback: for reservations without a matching date, do individual lookups
    const enriched = await Promise.all(result.map(async (r) => {
      let bedId = bedMap.get(r.id) || null;
      if (!bedId) {
        const bed = await db
          .select({ bedId: bedAssignments.bedId })
          .from(bedAssignments)
          .where(eq(bedAssignments.reservationId, r.id))
          .limit(1);
        bedId = bed[0]?.bedId ?? null;
      }
      return { ...r, bedId };
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = manualReservationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Create or find guest
    let guest = await db
      .select()
      .from(guests)
      .where(eq(guests.name, parsed.data.guestName));

    let guestId: number;
    if (guest.length > 0) {
      guestId = guest[0].id;
    } else {
      const result = await db
        .insert(guests)
        .values({
          name: parsed.data.guestName,
          email: parsed.data.email,
          gender: parsed.data.gender,
          notes: parsed.data.notes,
        })
        .returning({ id: guests.id });
      guestId = result[0].id;
    }

    // Create reservation
    const result = await db
      .insert(reservations)
      .values({
        source: "manual",
        guestId,
        checkIn: parsed.data.checkIn,
        checkOut: parsed.data.checkOut,
        roomTypeReq: parsed.data.roomTypeReq,
        numGuests: parsed.data.numGuests,
      })
      .returning({ id: reservations.id });

    // Auto-assign
    const assignment = await autoAssign([result[0].id]);

    return NextResponse.json({
      reservationId: result[0].id,
      assigned: assignment.assigned,
      unassigned: assignment.unassigned,
      errors: assignment.errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
