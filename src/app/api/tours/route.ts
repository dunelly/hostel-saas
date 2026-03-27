import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tours } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const all = await db.select().from(tours).orderBy(desc(tours.createdAt));
  return NextResponse.json(all);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, price, currency, date } = body;

    if (!name || price == null) {
      return NextResponse.json({ error: "Name and price are required" }, { status: 400 });
    }

    const result = await db
      .insert(tours)
      .values({ name, description, price, currency: currency || "VND", date })
      .returning();

    return NextResponse.json(result[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
