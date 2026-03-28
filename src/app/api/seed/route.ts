import { NextResponse } from "next/server";
import { seedDatabase } from "@/lib/db/seed";
import { migrate } from "@/lib/db/migrate";

export async function POST() {
  try {
    await migrate();
    await seedDatabase();
    return NextResponse.json({ success: true, message: "Database seeded" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
