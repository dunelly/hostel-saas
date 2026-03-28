import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guests } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const all = await db.select().from(guests).orderBy(desc(guests.createdAt));
  return NextResponse.json(all);
}
