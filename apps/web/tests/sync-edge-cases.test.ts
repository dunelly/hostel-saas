import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import { seedDatabase } from "../src/lib/db/seed";
import { bedAssignments, guests, reservations } from "../src/lib/db/schema";
import { autoAssign } from "../src/lib/services/assignment";
import { importReservations } from "../src/lib/services/reservation";
import { POST as syncSheet } from "../src/app/api/admin/sync-sheet/route";
import type { ReservationImport } from "../src/types";

const baseImport: ReservationImport = {
  guestName: "Sync Edge Guest",
  checkIn: "2026-06-01",
  checkOut: "2026-06-03",
  numGuests: 1,
  roomTypeReq: "mixed",
  preferredRoom: "1A",
  source: "booking.com",
  externalId: "SYNC-EDGE-1",
  totalPrice: 200000,
  currency: "VND",
};

async function clearSyncEdgeData() {
  await db.run(sql`delete from bed_assignments`);
  await db.run(sql`delete from reservations`);
  await db.run(sql`delete from guests`);
}

async function getReservation(externalId: string) {
  const row = await db
    .select()
    .from(reservations)
    .where(eq(reservations.externalId, externalId))
    .get();
  if (!row) throw new Error(`Missing reservation ${externalId}`);
  return row;
}

describe("sync edge case hardening", () => {
  beforeAll(async () => {
    await seedDatabase();
  });

  beforeEach(async () => {
    await clearSyncEdgeData();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates an existing OTA booking and queues reassignment when stay details change", async () => {
    const first = await importReservations([baseImport]);
    await autoAssign(first.assignIds);

    const existing = await getReservation("SYNC-EDGE-1");
    const beforeAssignments = await db
      .select()
      .from(bedAssignments)
      .where(eq(bedAssignments.reservationId, existing.id));
    expect(beforeAssignments).toHaveLength(2);

    const second = await importReservations([
      {
        ...baseImport,
        checkOut: "2026-06-04",
        preferredRoom: "2A",
        totalPrice: 300000,
      },
    ]);
    await autoAssign(second.assignIds);

    expect(second.updatedCount).toBe(1);
    expect(second.assignIds).toEqual([existing.id]);

    const updated = await getReservation("SYNC-EDGE-1");
    expect(updated.checkOut).toBe("2026-06-04");
    expect(updated.preferredRoomId).toBe("2A");
    expect(updated.totalPrice).toBe(300000);

    const afterAssignments = await db
      .select()
      .from(bedAssignments)
      .where(eq(bedAssignments.reservationId, existing.id));
    expect(afterAssignments).toHaveLength(3);
    expect(afterAssignments.every((row) => row.bedId.startsWith("2A-"))).toBe(true);
  });

  it("warns but keeps both reservations when the same guest name overlaps dates", async () => {
    await importReservations([baseImport]);

    const result = await importReservations([
      {
        ...baseImport,
        externalId: "SYNC-EDGE-2",
        checkIn: "2026-06-02",
        checkOut: "2026-06-05",
      },
    ]);

    expect(result.newIds).toHaveLength(1);
    expect(result.warnings).toContainEqual(expect.stringContaining("same guest overlaps"));

    const rows = await db
      .select()
      .from(reservations)
      .where(inArray(reservations.externalId, ["SYNC-EDGE-1", "SYNC-EDGE-2"]));
    expect(rows).toHaveLength(2);
  });

  it("does not leave partial rows when assignment cannot cover every night", async () => {
    const blockerGuest = await db.insert(guests).values({ name: "Blocker" }).returning({ id: guests.id });
    const blockerReservation = await db
      .insert(reservations)
      .values({
        source: "manual",
        guestId: blockerGuest[0].id,
        checkIn: "2026-06-01",
        checkOut: "2026-06-03",
        roomTypeReq: "female",
        preferredRoomId: "4B",
        numGuests: 1,
      })
      .returning({ id: reservations.id });

    for (let day = 1; day <= 2; day += 1) {
      const date = `2026-06-0${day}`;
      for (let bed = 1; bed <= 8; bed += 1) {
        if (date === "2026-06-01" && bed === 1) continue;
        await db.insert(bedAssignments).values({
          reservationId: blockerReservation[0].id,
          bedId: `4B-${String(bed).padStart(2, "0")}`,
          date,
          guestName: "Blocker",
          isManual: 1,
        });
      }
    }

    const targetGuest = await db.insert(guests).values({ name: "Partial Risk" }).returning({ id: guests.id });
    const target = await db
      .insert(reservations)
      .values({
        source: "manual",
        guestId: targetGuest[0].id,
        checkIn: "2026-06-01",
        checkOut: "2026-06-03",
        roomTypeReq: "female",
        preferredRoomId: "4B",
        numGuests: 1,
      })
      .returning({ id: reservations.id });

    const result = await autoAssign([target[0].id]);

    expect(result.unassigned).toBe(1);
    const partialRows = await db
      .select()
      .from(bedAssignments)
      .where(and(eq(bedAssignments.reservationId, target[0].id), eq(bedAssignments.guestName, "Partial Risk")));
    expect(partialRows).toHaveLength(0);
  });

  it("reports app bookings removed by authoritative Excel sync", async () => {
    await importReservations([
      {
        ...baseImport,
        guestName: "OTA Missing From Sheet",
        checkIn: "2026-06-01",
        checkOut: "2026-06-02",
        externalId: "SYNC-EDGE-REMOVED",
      },
    ]);

    const csv = [
      "",
      "",
      ",1-Jun",
      "",
      "ROOM 1A",
      "",
      ",Sheet Guest",
    ].join("\n");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(csv));

    const response = await syncSheet(new Request("http://localhost/api/admin/sync-sheet", {
      method: "POST",
      headers: { "x-admin-token": "sheet-sync-2026-04-29" },
    }));
    const data = await response.json();

    expect(data.replacedReservations).toBe(1);
    expect(data.replacedNames).toContain("OTA Missing From Sheet");
    expect(data.warning).toContain("Excel sync replaced app reservations");
  });
});
