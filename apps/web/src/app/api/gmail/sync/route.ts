import { NextResponse } from "next/server";
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

export async function POST(request: Request) {
  try {
    const row = await db.select().from(settings).where(eq(settings.key, "gmail_tokens")).get();
    if (!row) return NextResponse.json({ error: "Gmail not connected" }, { status: 401 });

    const current = await getSyncStatus();
    if (current.status === "running") return NextResponse.json({ status: "already_running" });

    const body = await request.json().catch(() => ({}));
    const deep = body.deep === true;

    await setSyncStatus("running");

    try {
      const result = await runGmailSync(deep);
      await setSyncResult(result);
      await setSyncStatus("done");
      return NextResponse.json({ status: "done", result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await setSyncResult({ error: message });
      await setSyncStatus("error");
      return NextResponse.json({ status: "error", error: message });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const syncStatus = await getSyncStatus();

    // Auto-reset stuck "running" status after 2 minutes
    if (syncStatus.status === "running" && syncStatus.updatedAt) {
      const elapsed = Date.now() - new Date(syncStatus.updatedAt).getTime();
      if (elapsed > 120_000) {
        await setSyncStatus("idle");
        return NextResponse.json({ ...syncStatus, status: "idle" });
      }
    }

    return NextResponse.json(syncStatus);
  } catch (err) {
    return NextResponse.json({ error: "Failed to get status" }, { status: 500 });
  }
}

// PATCH — update auto-sync settings (enabled)
export async function PATCH(request: Request) {
  try {
    const body = await request.json();

    if (body.resetStatus) {
      await setSyncStatus("idle");
    }

    if (typeof body.enabled === "boolean") {
      await db.insert(settings).values({ key: "gmail_auto_sync", value: String(body.enabled) })
        .onConflictDoUpdate({ target: settings.key, set: { value: String(body.enabled), updatedAt: new Date().toISOString() } });
    }

    const autoSync = await db.select().from(settings).where(eq(settings.key, "gmail_auto_sync")).get();

    return NextResponse.json({
      enabled: autoSync?.value !== "false",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
