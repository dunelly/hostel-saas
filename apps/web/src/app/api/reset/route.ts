import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bedAssignments, reservations, guests, importLog, tourSignups, laundryOrders } from "@/lib/db/schema";

// DELETE /api/reset — wipe all reservation data (keeps rooms & beds seeded data, keeps tours)
export async function DELETE(request: NextRequest) {
  try {
    const secret = process.env.RESET_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await db.delete(bedAssignments);
    await db.delete(tourSignups);
    await db.delete(laundryOrders);
    await db.delete(reservations);
    await db.delete(guests);
    await db.delete(importLog);

    return NextResponse.json({ success: true, message: "All reservation data cleared" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
