import { NextResponse } from "next/server";
import { getOAuthClient, GMAIL_SCOPES } from "@/lib/gmail/oauth";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";

export async function GET() {
  const state = crypto.randomUUID();

  // Store state for CSRF verification
  await db
    .insert(settings)
    .values({ key: "gmail_oauth_state", value: state })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: state, updatedAt: new Date().toISOString() },
    });

  const client = getOAuthClient();
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: GMAIL_SCOPES,
    prompt: "consent",
    state,
  });
  return NextResponse.redirect(url);
}
