import { google } from "googleapis";
import { getOAuthClient } from "./oauth";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseHostelworldEmail } from "./parser";
import { importReservations } from "@/lib/services/reservation";
import { autoAssign } from "@/lib/services/assignment";
import { reservations } from "@/lib/db/schema";
import type { ReservationImport } from "@/types";

/** Run promises in parallel batches of `size` */
async function batchAll<T>(items: T[], size: number, fn: (item: T) => Promise<any>): Promise<any[]> {
  const results: any[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

export interface SyncResult {
  imported: number;
  duplicates: number;
  errors: string[];
  emailsChecked: number;
  message?: string;
}

const SYNC_STATUS_KEY = "gmail_sync_status";
const SYNC_RESULT_KEY = "gmail_sync_result";

export type SyncStatus = "idle" | "running" | "done" | "error";

export interface SyncStatusResponse {
  status: SyncStatus;
  result: (SyncResult & { error?: string }) | null;
  updatedAt?: string;
}

async function setSyncStatus(status: SyncStatus) {
  await db
    .insert(settings)
    .values({ key: SYNC_STATUS_KEY, value: status })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: status, updatedAt: new Date().toISOString() },
    });
}

async function setSyncResult(result: SyncResult | { error: string }) {
  const value = JSON.stringify(result);
  await db
    .insert(settings)
    .values({ key: SYNC_RESULT_KEY, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date().toISOString() },
    });
}

export async function getSyncStatus(): Promise<SyncStatusResponse> {
  const [statusRow, resultRow] = await Promise.all([
    db.select().from(settings).where(eq(settings.key, SYNC_STATUS_KEY)).get(),
    db.select().from(settings).where(eq(settings.key, SYNC_RESULT_KEY)).get(),
  ]);
  return {
    status: (statusRow?.value as SyncStatus) ?? "idle",
    result: resultRow ? JSON.parse(resultRow.value) : null,
    updatedAt: statusRow?.updatedAt,
  };
}

/** Start sync in the background — returns immediately, sync runs on the server. */
export async function startSyncInBackground(): Promise<void> {
  const row = await db.select().from(settings).where(eq(settings.key, "gmail_tokens")).get();
  if (!row) throw new Error("Gmail not connected");

  const current = await getSyncStatus();
  if (current.status === "running") return;

  await setSyncStatus("running");

  // Fire and forget — Node.js keeps this running even after the HTTP response is sent
  runGmailSync()
    .then(async (result) => {
      await setSyncResult(result);
      await setSyncStatus("done");
    })
    .catch(async (err) => {
      const message = err instanceof Error ? err.message : "Unknown error";
      await setSyncResult({ error: message });
      await setSyncStatus("error");
    });
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
  // Only Hostelworld emails — Booking.com emails are not useful from Gmail
  const query = 'from:hostelworld.com subject:(booking OR reservation)';

  // Paginate to get all matching emails
  const messages: { id: string }[] = [];
  let pageToken: string | undefined;
  do {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 100,
      pageToken,
    });
    if (listRes.data.messages) {
      messages.push(...(listRes.data.messages as { id: string }[]));
    }
    pageToken = listRes.data.nextPageToken ?? undefined;
  } while (pageToken && messages.length < 500);

  if (messages.length === 0) {
    return { imported: 0, duplicates: 0, errors: [], emailsChecked: 0, message: "No reservation emails found." };
  }

  // Pre-load existing external IDs so we can skip emails we already imported
  const existingRows = await db
    .select({ externalId: reservations.externalId })
    .from(reservations)
    .all();
  const existingIds = new Set(existingRows.map((r) => r.externalId).filter(Boolean));

  const parsed: ReservationImport[] = [];
  const parseErrors: string[] = [];

  // Fetch emails in parallel batches of 10
  await batchAll(messages, 10, async (msg) => {
    try {
      const full = await gmail.users.messages.get({ userId: "me", id: msg.id!, format: "full" });
      const headers = full.data.payload?.headers || [];
      const subject = headers.find((h: any) => h.name === "Subject")?.value || "";
      const from = headers.find((h: any) => h.name === "From")?.value || "";
      const body = extractBody(full.data.payload);
      if (!body) return;

      const isHostelworld = from.toLowerCase().includes("hostelworld.com");
      if (!isHostelworld) return;

      const reservation = parseHostelworldEmail(subject, body);

      if (reservation && reservation.externalId && reservation.guestName && reservation.checkIn && reservation.checkOut) {
        // Skip if already imported
        if (existingIds.has(reservation.externalId)) return;
        parsed.push(reservation as ReservationImport);
      }
    } catch (err) {
      parseErrors.push(`Message ${msg.id}: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  });

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
    message: `Synced ${importResult.newIds.length} new, ${importResult.duplicateCount} already existed (${messages.length} emails scanned)`,
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
    return plainText || htmlText;
  }
  return null;
}
