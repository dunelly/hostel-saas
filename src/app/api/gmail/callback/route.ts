import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/gmail/oauth";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?gmail_error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.json({ error: "No code returned from Google" }, { status: 400 });
  }

  try {
    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/?gmail_error=no_refresh_token", request.url)
      );
    }

    // Store tokens in DB
    await db
      .insert(settings)
      .values({ key: "gmail_tokens", value: JSON.stringify(tokens) })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: JSON.stringify(tokens), updatedAt: new Date().toISOString() },
      });

    return NextResponse.redirect(new URL("/settings?gmail_connected=1", request.url));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.redirect(
      new URL(`/settings?gmail_error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
