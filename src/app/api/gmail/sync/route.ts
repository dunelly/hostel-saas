import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getOAuthClient } from "@/lib/gmail/oauth";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseBookingComEmail, parseHostelworldEmail } from "@/lib/gmail/parser";
import { importReservations } from "@/lib/services/reservation";
import { autoAssign } from "@/lib/services/assignment";

export async function POST() {
  try {
    // Load stored tokens
    const row = await db
      .select()
      .from(settings)
      .where(eq(settings.key, "gmail_tokens"))
      .get();

    if (!row) {
      return NextResponse.json({ error: "Gmail not connected. Go to Settings to connect." }, { status: 401 });
    }

    const tokens = JSON.parse(row.value);
    const client = getOAuthClient();
    client.setCredentials(tokens);

    // Refresh token if expired
    client.on("tokens", async (newTokens) => {
      const merged = { ...tokens, ...newTokens };
      await db
        .insert(settings)
        .values({ key: "gmail_tokens", value: JSON.stringify(merged) })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: JSON.stringify(merged), updatedAt: new Date().toISOString() },
        });
    });

    const gmail = google.gmail({ version: "v1", auth: client });

    // Search for reservation emails from both OTAs (last 30 days)
    const query = "from:(booking.com OR hostelworld.com) newer_than:30d";

    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 50,
    });

    const messages = listRes.data.messages || [];
    if (messages.length === 0) {
      return NextResponse.json({ imported: 0, duplicates: 0, errors: [], message: "No reservation emails found in the last 30 days." });
    }

    const parsed = [];
    const parseErrors: string[] = [];

    for (const msg of messages) {
      try {
        const full = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "full",
        });

        const headers = full.data.payload?.headers || [];
        const subject = headers.find((h) => h.name === "Subject")?.value || "";
        const from = headers.find((h) => h.name === "From")?.value || "";
        const body = extractBody(full.data.payload);

        if (!body) continue;

        const isBookingCom = from.toLowerCase().includes("booking.com");
        const isHostelworld = from.toLowerCase().includes("hostelworld.com");

        let reservation = null;
        if (isBookingCom) {
          reservation = parseBookingComEmail(subject, body);
        } else if (isHostelworld) {
          reservation = parseHostelworldEmail(subject, body);
        }

        if (reservation) {
          parsed.push(reservation);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown";
        parseErrors.push(`Message ${msg.id}: ${message}`);
      }
    }

    if (parsed.length === 0) {
      return NextResponse.json({
        imported: 0,
        duplicates: 0,
        errors: parseErrors,
        message: `Found ${messages.length} emails but could not parse any reservations. Email format may have changed.`,
      });
    }

    // Map null totalPrice → undefined to match ReservationImport type
    const toImport = parsed.map((r) => ({
      ...r,
      totalPrice: r.totalPrice ?? undefined,
    }));

    // Import and auto-assign
    const importResult = await importReservations(toImport);
    if (importResult.newIds.length > 0) {
      await autoAssign(importResult.newIds);
    }

    return NextResponse.json({
      imported: importResult.newIds.length,
      duplicates: importResult.duplicateCount,
      errors: [...importResult.errors, ...parseErrors],
      emailsChecked: messages.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Extract body text from Gmail message payload ─────────────────────────────

function extractBody(payload: any): string | null {
  if (!payload) return null;

  // Direct body
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  // Multipart — prefer text/html, fall back to text/plain
  if (payload.parts) {
    let plainText: string | null = null;
    let htmlText: string | null = null;

    for (const part of payload.parts) {
      const mime = part.mimeType || "";
      const data = part.body?.data;

      if (data) {
        const decoded = Buffer.from(data, "base64").toString("utf-8");
        if (mime === "text/html") htmlText = decoded;
        if (mime === "text/plain") plainText = decoded;
      }

      // Nested multipart
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) htmlText = htmlText || nested;
      }
    }

    return htmlText || plainText;
  }

  return null;
}
