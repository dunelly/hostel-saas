import { db } from "@/lib/db";
import { beds, rooms, bedAssignments, reservations, guests } from "@/lib/db/schema";
import { eq, and, inArray, gte, lte } from "drizzle-orm";
import { eachDayOfInterval, parseISO, subDays, format } from "date-fns";

interface AssignmentResult {
  assigned: number;
  unassigned: number;
  errors: string[];
}

/**
 * Auto-assign guests to beds for the given reservation IDs.
 * Respects room type constraints, avoids manual overrides, and packs rooms tightly.
 */
export async function autoAssign(
  reservationIds: number[]
): Promise<AssignmentResult> {
  const result: AssignmentResult = { assigned: 0, unassigned: 0, errors: [] };

  // Fetch reservations sorted by check-in date, then by group size (larger groups first)
  const reservationList = await db
    .select({
      id: reservations.id,
      guestId: reservations.guestId,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      roomTypeReq: reservations.roomTypeReq,
      preferredRoomId: reservations.preferredRoomId,
      numGuests: reservations.numGuests,
      status: reservations.status,
      guestName: guests.name,
    })
    .from(reservations)
    .innerJoin(guests, eq(reservations.guestId, guests.id))
    .where(inArray(reservations.id, reservationIds))
    .orderBy(reservations.checkIn, reservations.numGuests);

  // Sort: check-in ASC, num_guests DESC
  reservationList.sort((a, b) => {
    const dateComp = a.checkIn.localeCompare(b.checkIn);
    if (dateComp !== 0) return dateComp;
    return b.numGuests - a.numGuests;
  });

  // Fetch all rooms with beds
  const allRooms = await db.select().from(rooms);
  const allBeds = await db.select().from(beds);

  const roomMap = new Map(allRooms.map((r) => [r.id, r]));
  const bedsByRoom = new Map<string, typeof allBeds>();
  for (const bed of allBeds) {
    const roomBeds = bedsByRoom.get(bed.roomId) || [];
    roomBeds.push(bed);
    bedsByRoom.set(bed.roomId, roomBeds);
  }

  for (const reservation of reservationList) {
    if (reservation.status === "cancelled") continue;

    // Get the nights this guest stays (check-out day is departure, not a sleeping night)
    const stayDates = eachDayOfInterval({
      start: parseISO(reservation.checkIn),
      end: subDays(parseISO(reservation.checkOut), 1),
    }).map((d) => format(d, "yyyy-MM-dd"));

    if (stayDates.length === 0) continue;

    // Get eligible rooms: if a preferred room is set (from OTA room type), use that.
    // preferredRoomId can be comma-separated e.g. "3A,3B" for rooms that share a Booking.com type.
    // This is a hard constraint — guests should always go to the room they booked.
    let eligibleRoomIds: string[];
    if (reservation.preferredRoomId) {
      eligibleRoomIds = reservation.preferredRoomId.split(",").map((s) => s.trim());
    } else {
      eligibleRoomIds = allRooms
        .filter((r) => {
          if (reservation.roomTypeReq === "female") return r.roomType === "female";
          return r.roomType === "mixed";
        })
        .map((r) => r.id);
    }

    // Get existing assignments for the date range to check availability
    const existingAssignments = await db
      .select()
      .from(bedAssignments)
      .where(
        and(
          gte(bedAssignments.date, stayDates[0]),
          lte(bedAssignments.date, stayDates[stayDates.length - 1])
        )
      );

    // Build a set of occupied bed-dates
    const occupiedBedDates = new Set(
      existingAssignments.map((a) => `${a.bedId}:${a.date}`)
    );

    // Count occupancy per room for the first night (for packing heuristic)
    const roomOccupancy = new Map<string, number>();
    for (const a of existingAssignments) {
      if (a.date === stayDates[0]) {
        const bed = allBeds.find((b) => b.id === a.bedId);
        if (bed) {
          roomOccupancy.set(
            bed.roomId,
            (roomOccupancy.get(bed.roomId) || 0) + 1
          );
        }
      }
    }

    let guestsAssigned = 0;

    for (let g = 0; g < reservation.numGuests; g++) {
      const guestLabel =
        reservation.numGuests > 1
          ? `${reservation.guestName} (${g + 1})`
          : reservation.guestName;

      // Try to find a single bed for the entire stay
      const bestBed = findBestBed(
        eligibleRoomIds,
        bedsByRoom,
        stayDates,
        occupiedBedDates,
        roomOccupancy,
        roomMap
      );

      if (bestBed) {
        // Assign the same bed for all nights
        for (const date of stayDates) {
          await db.insert(bedAssignments).values({
            reservationId: reservation.id,
            bedId: bestBed.id,
            date,
            guestName: guestLabel,
            isManual: 0,
          });
          occupiedBedDates.add(`${bestBed.id}:${date}`);
        }
        roomOccupancy.set(
          bestBed.roomId,
          (roomOccupancy.get(bestBed.roomId) || 0) + 1
        );
        guestsAssigned++;
      } else {
        // Split stay: no single bed available for the full stay.
        // Assign night-by-night, allowing bed changes mid-stay.
        const assignedDates: string[] = [];
        let splitFailed = false;

        for (const date of stayDates) {
          const bedForNight = findBestBed(
            eligibleRoomIds,
            bedsByRoom,
            [date],
            occupiedBedDates,
            roomOccupancy,
            roomMap
          );

          if (!bedForNight) {
            splitFailed = true;
            break;
          }

          await db.insert(bedAssignments).values({
            reservationId: reservation.id,
            bedId: bedForNight.id,
            date,
            guestName: guestLabel,
            isManual: 0,
          });
          occupiedBedDates.add(`${bedForNight.id}:${date}`);
          assignedDates.push(date);
        }

        if (splitFailed) {
          result.errors.push(
            `Partially assigned ${guestLabel}: some nights have no beds available (${reservation.checkIn} to ${reservation.checkOut})`
          );
          result.unassigned++;
        } else {
          guestsAssigned++;
        }
      }
    }

    result.assigned += guestsAssigned;
  }

  return result;
}

/**
 * Find the best available bed that is free for ALL given dates.
 * Priority: rooms already partially filled (pack tightly), then lower room numbers.
 */
function findBestBed(
  eligibleRoomIds: string[],
  bedsByRoom: Map<string, { id: string; roomId: string; bedNumber: number }[]>,
  dates: string[],
  occupiedBedDates: Set<string>,
  roomOccupancy: Map<string, number>,
  roomMap: Map<string, { id: string; capacity: number }>
): { id: string; roomId: string } | null {
  type Candidate = {
    bedId: string;
    roomId: string;
    occupancyRatio: number;
    bedNumber: number;
  };

  const candidates: Candidate[] = [];

  for (const roomId of eligibleRoomIds) {
    const roomBeds = bedsByRoom.get(roomId) || [];
    const room = roomMap.get(roomId);
    if (!room) continue;

    for (const bed of roomBeds) {
      // Check if bed is free for ALL dates
      const isFree = dates.every(
        (date) => !occupiedBedDates.has(`${bed.id}:${date}`)
      );
      if (!isFree) continue;

      const occupancy = roomOccupancy.get(roomId) || 0;
      candidates.push({
        bedId: bed.id,
        roomId: roomId,
        occupancyRatio: occupancy / room.capacity,
        bedNumber: bed.bedNumber,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Sort: highest occupancy ratio first (pack rooms), then lowest bed number
  candidates.sort((a, b) => {
    // Prefer rooms that are partially filled but not empty (pack tightly)
    // But if a room is completely empty vs partially filled, prefer the partially filled one
    if (a.occupancyRatio !== b.occupancyRatio) {
      return b.occupancyRatio - a.occupancyRatio;
    }
    return a.bedNumber - b.bedNumber;
  });

  return { id: candidates[0].bedId, roomId: candidates[0].roomId };
}
