import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shifts, daysOff, staff } from "@/lib/db/schema";
import { and, gte, lte, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    if (!from || !to) {
      return NextResponse.json({ error: "Missing from/to params" }, { status: 400 });
    }

    const allShifts = await db
      .select({
        id: shifts.id,
        staffId: shifts.staffId,
        staffName: staff.name,
        staffColor: staff.color,
        date: shifts.date,
        shiftType: shifts.shiftType,
        note: shifts.note,
      })
      .from(shifts)
      .innerJoin(staff, eq(shifts.staffId, staff.id))
      .where(and(gte(shifts.date, from), lte(shifts.date, to)));

    const allDaysOff = await db
      .select({
        id: daysOff.id,
        staffId: daysOff.staffId,
        staffName: staff.name,
        date: daysOff.date,
      })
      .from(daysOff)
      .innerJoin(staff, eq(daysOff.staffId, staff.id))
      .where(and(gte(daysOff.date, from), lte(daysOff.date, to)));

    return NextResponse.json({ shifts: allShifts, daysOff: allDaysOff });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { staffId, date, shiftType, note } = body;

    if (!staffId || !date || !shiftType) {
      return NextResponse.json({ error: "staffId, date, and shiftType required" }, { status: 400 });
    }

    // Upsert: delete existing shift for same staff+date+type, then insert
    await db.delete(shifts).where(
      and(eq(shifts.staffId, staffId), eq(shifts.date, date), eq(shifts.shiftType, shiftType))
    );

    const result = await db.insert(shifts).values({
      staffId, date, shiftType, note: note || null,
    }).returning({ id: shifts.id });

    return NextResponse.json(result[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, type } = body;

    if (type === "dayoff") {
      await db.delete(daysOff).where(eq(daysOff.id, id));
    } else {
      await db.delete(shifts).where(eq(shifts.id, id));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    // Toggle day off
    if (body.action === "toggle_dayoff") {
      const { staffId, date } = body;
      const existing = await db.select().from(daysOff)
        .where(and(eq(daysOff.staffId, staffId), eq(daysOff.date, date)));

      if (existing.length > 0) {
        await db.delete(daysOff).where(eq(daysOff.id, existing[0].id));
        return NextResponse.json({ removed: true });
      } else {
        await db.insert(daysOff).values({ staffId, date });
        return NextResponse.json({ added: true });
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
