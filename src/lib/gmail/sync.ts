import { google } from "googleapis";
import { getOAuthClient } from "./oauth";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseBookingComEmail, parseHostelworldEmail } from "./parser";
import { importReservations } from "@/lib/services/reservation";
import { autoAssign } from "@/lib/services/assignment";
import type { ReservationImport } from "@/types";

export interface SyncResult {
  imported: number;
  duplicates: number;
  errors: string[];
  emailsChecked: number;
  message?: string;
}

export async function runGmailSync(): Promise<SyncResult> {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "gmail_tokens"))
    .get();

  if (!row) {
    throw new Error("Gmail not connected");
  }

  const tokens = JSON.parse(row.value);
  const client = getOAuthClient();
  client.setCredentials(tokens);

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
  const query = "from:(booking.com OR hostelworld.com) newer_than:30d";

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 50,
  });

  const messages = listRes.data.messages || [];
  if (messages.length === 0) {
    return { imported: 0, duplicates: 0, errors: [], emailsChecked: 0, message: "No reservation emails found in the last 30 days." };
  }

  const parsed: ReservationImport[] = [];
  const parseErrors: string[] = [];

  for (const msg of messages) {
    try {
      const full = await gmail.users.messages.get({ userId: "me", id: msg.id!, format: "full" });
      const headers = full.data.payload?.headers || [];
      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const from = headers.find((h) => h.name === "From")?.value || "";
      const body = extractBody(full.data.payload);
      if (!body) continue;

      const isBookingCom = from.toLowerCase().includes("booking.com");
      const isHostelworld = from.toLowerCase().includes("hostelworld.com");

      let reservation = null;
      if (isBookingCom) reservation = parseBookingComEmail(subject, body);
      else if (isHostelworld) reservation = parseHostelworldEmail(subject, body);

      if (reservation && reservation.externalId && reservation.guestName && reservation.checkIn && reservation.checkOut) {
        parsed.push(reservation as ReservationImport);
      }
    } catch (err) {
      parseErrors.push(`Message ${msg.id}: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  if (parsed.length === 0) {
    return {
      imported: 0,
      duplicates: 0,
      errors: parseErrors,
      emailsChecked: messages.length,
      message: `Found ${messages.length} emails but could not parse any reservations.`,
    };
  }

  const importResult = await importReservations(parsed);
  if (importResult.newIds.length > 0) {
    await autoAssign(importResult.newIds);
  }

  // Record last sync time
  await db
    .insert(settings)
    .values({ key: "gmail_last_sync", value: new Date().toISOString() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: new Date().toISOString(), updatedAt: new Date().toISOString() },
    });

  return {
    imported: importResult.newIds.length,
    duplicates: importResult.duplicateCount,
    errors: [...importResult.errors, ...parseErrors],
    emailsChecked: messages.length,
  };
}

function extractBody(payload: any): string | null {
  if (!payload) return null;
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
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
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) htmlText = htmlText || nested;
      }
    }
    return htmlText || plainText;
  }
  return null;
}
