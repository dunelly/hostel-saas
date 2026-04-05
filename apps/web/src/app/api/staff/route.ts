import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { staff } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const allStaff = await db.select().from(staff).where(eq(staff.active, 1));
    return NextResponse.json(allStaff);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, color } = body;
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const result = await db.insert(staff).values({
      name,
      color: color || "#6366f1",
    }).returning({ id: staff.id });

    return NextResponse.json(result[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
