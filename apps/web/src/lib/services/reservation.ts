import { db } from "@/lib/db";
import { guests, reservations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { ReservationImport } from "@/types";

// ─── Currency conversion to VND ───────────────────────────────────────────────
// Cache rates for 1 hour so we don't hit the API on every import
let rateCache: { rates: Record<string, number>; fetchedAt: number } | null = null;

async function getVndRate(currency: string): Promise<number | null> {
  if (currency === "VND") return 1;
  try {
    const now = Date.now();
    if (!rateCache || now - rateCache.fetchedAt > 3_600_000) {
      const res = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 3600 } });
      if (res.ok) {
        const data = await res.json();
        rateCache = { rates: data.rates, fetchedAt: now };
      }
    }
    if (!rateCache) return null;
    const usdToVnd = rateCache.rates["VND"] ?? null;
    if (!usdToVnd) return null;
    if (currency === "USD") return usdToVnd;
    // For EUR/GBP: convert via USD
    const currencyToUsd = rateCache.rates[currency] ? 1 / rateCache.rates[currency] : null;
    return currencyToUsd ? currencyToUsd * usdToVnd : null;
  } catch {
    return null;
  }
}

/**
 * Import reservations from an OTA source, deduplicating by external ID.
 * Returns the IDs of newly created reservations.
 */
export async function importReservations(
  imports: ReservationImport[]
): Promise<{ newIds: number[]; duplicateCount: number; errors: string[] }> {
  const newIds: number[] = [];
  let duplicateCount = 0;
  const errors: string[] = [];

  for (const imp of imports) {
    try {
      // Check for duplicate
      if (imp.externalId) {
        const existing = await db
          .select({ id: reservations.id, currency: reservations.currency, totalPrice: reservations.totalPrice })
          .from(reservations)
          .where(
            and(
              eq(reservations.externalId, imp.externalId),
              eq(reservations.source, imp.source)
            )
          );
        if (existing.length > 0) {
          // Backfill: if stored as non-VND, convert and update
          const stored = existing[0];
          if (stored.currency && stored.currency !== "VND" && stored.totalPrice) {
            const rate = await getVndRate(stored.currency);
            if (rate) {
              await db
                .update(reservations)
                .set({ totalPrice: Math.round(stored.totalPrice * rate), currency: "VND" })
                .where(eq(reservations.id, stored.id));
            }
          }
          duplicateCount++;
          continue;
        }
      }

      // Upsert guest by name
      let guest = await db
        .select()
        .from(guests)
        .where(eq(guests.name, imp.guestName));

      let guestId: number;
      if (guest.length > 0) {
        guestId = guest[0].id;
      } else {
        const result = await db
          .insert(guests)
          .values({ name: imp.guestName })
          .returning({ id: guests.id });
        guestId = result[0].id;
      }

      // Convert price to VND if needed
      let totalPrice = imp.totalPrice ?? null;
      let currency = imp.currency ?? "VND";
      if (totalPrice && currency !== "VND") {
        const rate = await getVndRate(currency);
        if (rate) {
          totalPrice = Math.round(totalPrice * rate);
          currency = "VND";
        }
      }

      // Create reservation
      const result = await db
        .insert(reservations)
        .values({
          externalId: imp.externalId,
          source: imp.source,
          guestId,
          checkIn: imp.checkIn,
          checkOut: imp.checkOut,
          roomTypeReq: imp.roomTypeReq,
          preferredRoomId: imp.preferredRoom || null,
          numGuests: imp.numGuests,
          totalPrice,
          currency,
          rawData: imp.rawHtml || null,
        })
        .returning({ id: reservations.id });

      newIds.push(result[0].id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Failed to import ${imp.guestName}: ${message}`);
    }
  }

  return { newIds, duplicateCount, errors };
}
