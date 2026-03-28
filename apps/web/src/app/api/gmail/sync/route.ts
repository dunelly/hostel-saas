import { NextResponse } from "next/server";
import { runGmailSync } from "@/lib/gmail/sync";

export async function POST() {
  try {
    const result = await runGmailSync();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Gmail not connected" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
