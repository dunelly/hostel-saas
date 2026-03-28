import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const row = await db
      .select()
      .from(settings)
      .where(eq(settings.key, "gmail_tokens"))
      .get();

    if (!row) return NextResponse.json({ connected: false });

    const tokens = JSON.parse(row.value);
    const hasRefreshToken = !!tokens.refresh_token;

    return NextResponse.json({
      connected: hasRefreshToken,
      updatedAt: row.updatedAt,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
