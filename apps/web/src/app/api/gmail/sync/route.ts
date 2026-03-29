import { NextResponse } from "next/server";
import { startSyncInBackground, getSyncStatus } from "@/lib/gmail/sync";

export async function POST() {
  try {
    await startSyncInBackground();
    return NextResponse.json({ status: "started" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Gmail not connected" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
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
