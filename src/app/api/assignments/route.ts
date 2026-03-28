import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bedAssignments, reservations } from "@/lib/db/schema";
import { and, gte, lte, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "Missing 'from' and 'to' query params (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const assignments = await db
      .select({
        id: bedAssignments.id,
        reservationId: bedAssignments.reservationId,
        bedId: bedAssignments.bedId,
        date: bedAssignments.date,
        guestName: bedAssignments.guestName,
        isManual: bedAssignments.isManual,
        guestId: reservations.guestId,
        source: reservations.source,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        paymentStatus: reservations.paymentStatus,
        status: reservations.status,
        numGuests: reservations.numGuests,
        roomTypeReq: reservations.roomTypeReq,
        totalPrice: reservations.totalPrice,
        amountPaid: reservations.amountPaid,
        currency: reservations.currency,
        externalId: reservations.externalId,
      })
      .from(bedAssignments)
      .innerJoin(
        reservations,
        eq(bedAssignments.reservationId, reservations.id)
      )
      .where(
        and(
          gte(bedAssignments.date, from),
          lte(bedAssignments.date, to)
        )
      );

    return NextResponse.json(assignments);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
