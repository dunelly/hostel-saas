import { db } from "@/lib/db";
import { guests, reservations, bedAssignments } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
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
): Promise<{
  newIds: number[];
  assignIds: number[];
  duplicateCount: number;
  updatedCount: number;
  errors: string[];
  warnings: string[];
}> {
  const newIds: number[] = [];
  const assignIds: number[] = [];
  let duplicateCount = 0;
  let updatedCount = 0;
  const errors: string[] = [];
  const warnings: string[] = [];

  async function getOrCreateGuestId(name: string) {
    const guest = await db
      .select()
      .from(guests)
      .where(sql`lower(${guests.name}) = lower(${name})`);

    if (guest.length > 0) return guest[0].id;

    const result = await db
      .insert(guests)
      .values({ name })
      .returning({ id: guests.id });
    return result[0].id;
  }

  async function warnOnNameOverlap(name: string, checkIn: string, checkOut: string, excludeReservationId?: number) {
    const overlaps = await db
      .select({
        id: reservations.id,
        externalId: reservations.externalId,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
      })
      .from(reservations)
      .innerJoin(guests, eq(reservations.guestId, guests.id))
      .where(sql`
        lower(${guests.name}) = lower(${name})
        and ${reservations.checkIn} < ${checkOut}
        and ${reservations.checkOut} > ${checkIn}
      `);

    for (const overlap of overlaps) {
      if (excludeReservationId && overlap.id === excludeReservationId) continue;
      warnings.push(
        `same guest overlaps another reservation: ${name} (${checkIn} to ${checkOut}) overlaps ${overlap.externalId ?? overlap.id} (${overlap.checkIn} to ${overlap.checkOut})`
      );
    }
  }

  async function findCoveringExcelReservation(name: string, checkIn: string, checkOut: string) {
    return db
      .select({
        id: reservations.id,
        externalId: reservations.externalId,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
      })
      .from(reservations)
      .innerJoin(guests, eq(reservations.guestId, guests.id))
      .where(sql`
        lower(${guests.name}) = lower(${name})
        and ${reservations.status} != 'cancelled'
        and ${reservations.rawData} like '%excel-sheet%'
        and ${reservations.checkIn} < ${checkOut}
        and ${reservations.checkOut} > ${checkIn}
      `)
      .limit(1);
  }

  for (const imp of imports) {
    try {
      const trimmedName = imp.guestName.trim();

      if (imp.source !== "manual") {
        const coveredByExcel = await findCoveringExcelReservation(trimmedName, imp.checkIn, imp.checkOut);
        if (coveredByExcel.length > 0) {
          const sheetReservation = coveredByExcel[0];
          warnings.push(
            `skipped ${imp.source} import covered by Excel sheet: ${trimmedName} (${imp.checkIn} to ${imp.checkOut}) overlaps ${sheetReservation.externalId ?? sheetReservation.id} (${sheetReservation.checkIn} to ${sheetReservation.checkOut})`
          );
          duplicateCount++;
          continue;
        }
      }

      const guestId = await getOrCreateGuestId(trimmedName);

      // Check for duplicate
      if (imp.externalId) {
        const existing = await db
          .select({
            id: reservations.id,
            guestId: reservations.guestId,
            checkIn: reservations.checkIn,
            checkOut: reservations.checkOut,
            roomTypeReq: reservations.roomTypeReq,
            preferredRoomId: reservations.preferredRoomId,
            numGuests: reservations.numGuests,
            currency: reservations.currency,
            totalPrice: reservations.totalPrice,
          })
          .from(reservations)
          .where(
            and(
              eq(reservations.externalId, imp.externalId),
              eq(reservations.source, imp.source)
            )
          );
        if (existing.length > 0) {
          const stored = existing[0];
          await warnOnNameOverlap(trimmedName, imp.checkIn, imp.checkOut, stored.id);

          // Convert incoming price to VND before comparing/updating.
          let totalPrice = imp.totalPrice ?? null;
          let currency = imp.currency ?? "VND";
          if (totalPrice && currency !== "VND") {
            const rate = await getVndRate(currency);
            if (rate) {
              totalPrice = Math.round(totalPrice * rate);
              currency = "VND";
            }
          }

          // Backfill: if stored as non-VND, convert and update
          if (stored.currency && stored.currency !== "VND" && stored.totalPrice) {
            const rate = await getVndRate(stored.currency);
            if (rate) {
              await db
                .update(reservations)
                .set({ totalPrice: Math.round(stored.totalPrice * rate), currency: "VND" })
                .where(eq(reservations.id, stored.id));
            }
          }

          const nextPreferredRoomId = imp.preferredRoom || null;
          const assignmentFieldsChanged =
            stored.checkIn !== imp.checkIn ||
            stored.checkOut !== imp.checkOut ||
            stored.roomTypeReq !== imp.roomTypeReq ||
            stored.preferredRoomId !== nextPreferredRoomId ||
            stored.numGuests !== imp.numGuests ||
            stored.guestId !== guestId;

          const anyFieldsChanged =
            assignmentFieldsChanged ||
            stored.totalPrice !== totalPrice ||
            (stored.currency ?? "VND") !== currency;

          if (anyFieldsChanged) {
            await db
              .update(reservations)
              .set({
                guestId,
                checkIn: imp.checkIn,
                checkOut: imp.checkOut,
                roomTypeReq: imp.roomTypeReq,
                preferredRoomId: nextPreferredRoomId,
                numGuests: imp.numGuests,
                totalPrice,
                currency,
                rawData: imp.rawHtml || null,
              })
              .where(eq(reservations.id, stored.id));
            updatedCount++;
          }

          if (assignmentFieldsChanged) {
            await db
              .delete(bedAssignments)
              .where(
                and(
                  eq(bedAssignments.reservationId, stored.id),
                  eq(bedAssignments.isManual, 0)
                )
              );
            assignIds.push(stored.id);
          }

          const assignment = await db
            .select({ id: bedAssignments.id })
            .from(bedAssignments)
            .where(eq(bedAssignments.reservationId, stored.id))
            .limit(1);
          if (assignment.length === 0 && !assignIds.includes(stored.id)) {
            assignIds.push(stored.id);
          }
          duplicateCount++;
          continue;
        }
      }

      await warnOnNameOverlap(trimmedName, imp.checkIn, imp.checkOut);

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
      assignIds.push(result[0].id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Failed to import ${imp.guestName}: ${message}`);
    }
  }

  return { newIds, assignIds, duplicateCount, updatedCount, errors, warnings };
}
