import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { laundryOrders } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const all = await db.select().from(laundryOrders).orderBy(desc(laundryOrders.droppedOffAt));
  return NextResponse.json(all);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { guestId, guestName, items, weight, price, currency } = body;

    if (!guestId || !guestName || price == null) {
      return NextResponse.json({ error: "guestId, guestName, and price are required" }, { status: 400 });
    }

    const result = await db
      .insert(laundryOrders)
      .values({
        guestId,
        guestName,
        items,
        weight,
        price,
        currency: currency || "VND",
        droppedOffAt: new Date().toISOString(),
      })
      .returning();

    return NextResponse.json(result[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
