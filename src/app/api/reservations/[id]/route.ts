import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reservations, bedAssignments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const updateSchema = z.object({
  status: z
    .enum(["confirmed", "cancelled", "checked_in", "checked_out", "no_show"])
    .optional(),
  paymentStatus: z.enum(["paid", "unpaid", "partial", "refunded"]).optional(),
  amountPaid: z.number().min(0).optional(),
  totalPrice: z.number().min(0).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const reservationId = parseInt(id);
    if (isNaN(reservationId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.paymentStatus !== undefined)
      updates.paymentStatus = parsed.data.paymentStatus;
    if (parsed.data.amountPaid !== undefined)
      updates.amountPaid = parsed.data.amountPaid;
    if (parsed.data.totalPrice !== undefined)
      updates.totalPrice = parsed.data.totalPrice;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    await db
      .update(reservations)
      .set(updates)
      .where(eq(reservations.id, reservationId));

    if (updates.status === "cancelled" || updates.status === "no_show") {
      await db.delete(bedAssignments).where(eq(bedAssignments.reservationId, reservationId));
    }

    return NextResponse.json({ success: true, updated: updates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
