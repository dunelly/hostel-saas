import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { laundryOrders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orderId = parseInt(id);
  if (isNaN(orderId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.paymentStatus !== undefined) updates.paymentStatus = body.paymentStatus;
  if (body.amountPaid !== undefined) updates.amountPaid = body.amountPaid;
  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === "done" || body.status === "collected") {
      updates.completedAt = new Date().toISOString();
    }
  }
  if (body.items !== undefined) updates.items = body.items;
  if (body.weight !== undefined) updates.weight = body.weight;
  if (body.price !== undefined) updates.price = body.price;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates" }, { status: 400 });
  }

  await db.update(laundryOrders).set(updates).where(eq(laundryOrders.id, orderId));
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orderId = parseInt(id);
  if (isNaN(orderId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  await db.delete(laundryOrders).where(eq(laundryOrders.id, orderId));
  return NextResponse.json({ success: true });
}
