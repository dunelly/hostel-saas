import { db } from "@/lib/db";
import { guests, reservations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { ReservationImport } from "@/types";

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
          .select({ id: reservations.id })
          .from(reservations)
          .where(
            and(
              eq(reservations.externalId, imp.externalId),
              eq(reservations.source, imp.source)
            )
          );
        if (existing.length > 0) {
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
          totalPrice: imp.totalPrice,
          currency: imp.currency,
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
