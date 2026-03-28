import { NextResponse } from "next/server";
import { getOAuthClient, GMAIL_SCOPES } from "@/lib/gmail/oauth";

export async function GET() {
  const client = getOAuthClient();
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: GMAIL_SCOPES,
    prompt: "consent", // Force refresh token on every auth
  });
  return NextResponse.redirect(url);
}
