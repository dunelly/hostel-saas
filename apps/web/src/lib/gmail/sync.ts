import { google } from "googleapis";
import { getOAuthClient } from "./oauth";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseHostelworldEmail, parseHostelworldCancellation } from "./parser";
import { parseEmailWithGemini } from "./gemini-parser";
import { importReservations } from "@/lib/services/reservation";
import { autoAssign } from "@/lib/services/assignment";
import { reservations, bedAssignments } from "@/lib/db/schema";
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
  cancelled: number;
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
export async function runGmailSync(deep = false): Promise<SyncResult> {
  const useGemini = !!process.env.GEMINI_API_KEY;

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

  // Build query — deep scan skips date filter to catch all historical emails
  let query: string;
  let maxEmails: number;

  if (deep) {
    query = 'from:hostelworld.com subject:(booking OR reservation OR cancellation OR cancelled)';
    maxEmails = 300;
  } else {
    // Incremental: only scan emails since last sync (or last 7 days on first run)
    let afterDate: string;
    const lastSyncRow = await db.select().from(settings).where(eq(settings.key, "gmail_last_sync")).get();
    if (lastSyncRow?.value) {
      const d = new Date(lastSyncRow.value);
      d.setDate(d.getDate() - 1);
      afterDate = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      afterDate = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    }
    query = `from:hostelworld.com subject:(booking OR reservation OR cancellation OR cancelled) after:${afterDate}`;
    maxEmails = 200;
  }

  // Paginate to get matching emails
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
  } while (pageToken && messages.length < maxEmails);

  if (messages.length === 0) {
    return { imported: 0, duplicates: 0, cancelled: 0, errors: [], emailsChecked: 0, message: "No reservation emails found." };
  }

  // Pre-load existing external IDs so we can skip emails we already imported
  const existingRows = await db
    .select({ externalId: reservations.externalId })
    .from(reservations)
    .all();
  const existingIds = new Set(existingRows.map((r) => r.externalId).filter(Boolean));

  const parsed: ReservationImport[] = [];
  const cancellationIds: string[] = [];
  const parseErrors: string[] = [];

  // Fetch emails in batches (smaller when using Gemini due to API rate limits)
  await batchAll(messages, useGemini ? 3 : 10, async (msg) => {
    try {
      const full = await gmail.users.messages.get({ userId: "me", id: msg.id!, format: "full" });
      const headers = full.data.payload?.headers || [];
      const subject = headers.find((h: any) => h.name === "Subject")?.value || "";
      const from = headers.find((h: any) => h.name === "From")?.value || "";
      const body = extractBody(full.data.payload);
      if (!body) return;

      const isHostelworld = from.toLowerCase().includes("hostelworld.com");
      if (!isHostelworld) return;

      // Try Gemini AI parser first, fall back to regex
      if (useGemini) {
        try {
          const { reservation, cancellationId } = await parseEmailWithGemini(subject, body);
          if (cancellationId) {
            cancellationIds.push(cancellationId);
            return;
          }
          if (reservation && reservation.externalId && reservation.guestName && reservation.checkIn && reservation.checkOut) {
            if (existingIds.has(reservation.externalId)) return;
            parsed.push(reservation as ReservationImport);
            return;
          }
        } catch (err) {
          // Gemini failed, fall through to regex
        }
      }

      // Regex fallback
      const cancelledExternalId = parseHostelworldCancellation(subject, body);
      if (cancelledExternalId) {
        cancellationIds.push(cancelledExternalId);
        return;
      }

      const reservation = parseHostelworldEmail(subject, body);

      if (reservation && reservation.externalId && reservation.guestName && reservation.checkIn && reservation.checkOut) {
        if (existingIds.has(reservation.externalId)) return;
        parsed.push(reservation as ReservationImport);
      }
    } catch (err) {
      parseErrors.push(`Message ${msg.id}: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  });

  // Process cancellations — mark as cancelled and remove bed assignments
  let cancelledCount = 0;
  if (cancellationIds.length > 0) {
    const uniqueCancelIds = [...new Set(cancellationIds)];
    for (const extId of uniqueCancelIds) {
      const row = await db
        .select({ id: reservations.id, status: reservations.status })
        .from(reservations)
        .where(eq(reservations.externalId, extId))
        .get();
      if (row && row.status !== "cancelled") {
        await db.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, row.id));
        await db.delete(bedAssignments).where(eq(bedAssignments.reservationId, row.id));
        cancelledCount++;
      }
    }
  }

  if (parsed.length === 0 && cancelledCount === 0) {
    return {
      imported: 0,
      duplicates: 0,
      cancelled: cancelledCount,
      errors: parseErrors,
      emailsChecked: messages.length,
      message: `Found ${messages.length} emails but could not parse any reservations.`,
    };
  }

  let importResult = { newIds: [] as number[], duplicateCount: 0, errors: [] as string[] };
  if (parsed.length > 0) {
    importResult = await importReservations(parsed);
    if (importResult.newIds.length > 0) {
      await autoAssign(importResult.newIds);
    }

    // Forward new reservations to mirror URL (e.g. localhost syncs → push to Vercel)
    const mirrorUrl = process.env.MIRROR_SYNC_URL;
    if (mirrorUrl && parsed.length > 0) {
      try {
        await fetch(`${mirrorUrl}/api/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reservations: parsed }),
        });
      } catch (e) {
        // Mirror sync is best-effort, don't fail the main sync
      }
    }

    // Forward cancellations to mirror URL
    if (mirrorUrl && cancellationIds.length > 0) {
      try {
        await fetch(`${mirrorUrl}/api/reservations/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ externalIds: [...new Set(cancellationIds)] }),
        });
      } catch (e) {}
    }
  }

  // Record last sync time
  await db
    .insert(settings)
    .values({ key: "gmail_last_sync", value: new Date().toISOString() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: new Date().toISOString(), updatedAt: new Date().toISOString() },
    });

  const parts = [`Synced ${importResult.newIds.length} new`, `${importResult.duplicateCount} already existed`];
  if (cancelledCount > 0) parts.push(`${cancelledCount} cancelled`);
  parts.push(`(${messages.length} emails scanned${useGemini ? ", AI-powered" : ""})`);

  return {
    imported: importResult.newIds.length,
    duplicates: importResult.duplicateCount,
    cancelled: cancelledCount,
    errors: [...importResult.errors, ...parseErrors],
    emailsChecked: messages.length,
    message: parts.join(", "),
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
