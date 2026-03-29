import { NextResponse, after } from "next/server";
import { getSyncStatus, runGmailSync } from "@/lib/gmail/sync";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const maxDuration = 60;

async function setSyncStatus(status: string) {
  await db.insert(settings).values({ key: "gmail_sync_status", value: status })
    .onConflictDoUpdate({ target: settings.key, set: { value: status, updatedAt: new Date().toISOString() } });
}

async function setSyncResult(result: object) {
  const value = JSON.stringify(result);
  await db.insert(settings).values({ key: "gmail_sync_result", value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date().toISOString() } });
}

export async function POST() {
  try {
    const row = await db.select().from(settings).where(eq(settings.key, "gmail_tokens")).get();
    if (!row) return NextResponse.json({ error: "Gmail not connected" }, { status: 401 });

    const current = await getSyncStatus();
    if (current.status === "running") return NextResponse.json({ status: "already_running" });

    await setSyncStatus("running");

    // after() tells Vercel (and Next.js) to keep running this after the response is sent
    after(async () => {
      try {
        const result = await runGmailSync();
        await setSyncResult(result);
        await setSyncStatus("done");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        await setSyncResult({ error: message });
        await setSyncStatus("error");
      }
    });

    return NextResponse.json({ status: "started" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const syncStatus = await getSyncStatus();
    return NextResponse.json(syncStatus);
  } catch (err) {
    return NextResponse.json({ error: "Failed to get status" }, { status: 500 });
  }
}
