import { NextRequest, NextResponse } from "next/server";
import { runGmailSync } from "@/lib/gmail/sync";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Called by Vercel Cron every hour — see vercel.json
// Checks if auto-sync is enabled and if current hour matches configured sync hour
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if auto-sync is enabled
  const autoSync = await db.select().from(settings).where(eq(settings.key, "gmail_auto_sync")).get();
  if (autoSync?.value === "false") {
    return NextResponse.json({ skipped: true, reason: "Auto-sync disabled" });
  }

  try {
    const result = await runGmailSync();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
