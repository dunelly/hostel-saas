import { db } from "@/lib/db";
import { guests, reservations, bedAssignments } from "@/lib/db/schema";
import { addOneDay, buildReservations, parseSheetRowsFromCsv, type SheetNight } from "@/lib/sheet-sync/parser";
import { sql } from "drizzle-orm";

const ADMIN_TOKEN = "sheet-sync-2026-04-29";
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1m1OgIVRRgZvzvd-WzOeRLVrB1EpjllN0adsc4pmNXPU/export?format=csv&gid={gid}";

function minIsoDate(values: string[]): string {
  return values.reduce((min, value) => (value < min ? value : min), values[0]);
}

function maxIsoDate(values: string[]): string {
  return values.reduce((max, value) => (value > max ? value : max), values[0]);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchSheetRows(gid: string) {
  const res = await fetch(SHEET_URL.replace("{gid}", gid));
  if (!res.ok) {
    throw new Error(`Failed to fetch sheet ${gid}: ${res.status}`);
  }
  const text = await res.text();
  return parseSheetRowsFromCsv(gid, text);
}

export async function POST(request: Request) {
  const token = request.headers.get("x-admin-token");
  if (token !== ADMIN_TOKEN) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [aprilRows, mayRows] = await Promise.all([
    fetchSheetRows("923324031"),
    fetchSheetRows("1888445989"),
  ]);
  const sheetRows = [...aprilRows, ...mayRows];
  const importedDates = [...new Set(sheetRows.map((row) => row.date))].sort();
  if (importedDates.length === 0) {
    return Response.json({ error: "No sheet rows parsed" }, { status: 400 });
  }
  const deleteFrom = minIsoDate(importedDates);
  const deleteUntil = addOneDay(maxIsoDate(importedDates));
  const reservationsToInsert = buildReservations(sheetRows).map((row, index) => ({
    ...row,
    syncKey: `${row.bedId}:${row.start}:${addOneDay(row.end)}:${row.name}:${index}`,
  }));
  const replacedRows = await db
    .select({
      id: reservations.id,
      name: guests.name,
      source: reservations.source,
      externalId: reservations.externalId,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
    })
    .from(reservations)
    .innerJoin(guests, sql`${reservations.guestId} = ${guests.id}`)
    .where(sql`
      ${reservations.checkIn} < ${deleteUntil}
      and ${reservations.checkOut} >= ${deleteFrom}
    `);
  const replacedNames = [...new Set(replacedRows.map((row) => row.name))].sort();

  await db.run(sql`
    delete from bed_assignments
    where reservation_id in (
      select id from reservations
      where check_in < ${deleteUntil}
        and check_out >= ${deleteFrom}
    )
  `);
  await db.run(sql`
    delete from reservations
    where check_in < ${deleteUntil}
      and check_out >= ${deleteFrom}
  `);

  const existingGuests = await db.select({ id: guests.id, name: guests.name }).from(guests);
  const nameToId = new Map<string, number>();
  for (const guest of existingGuests) {
    const key = guest.name.toLowerCase();
    if (!nameToId.has(key)) nameToId.set(key, guest.id);
  }

  const neededNames = [...new Set(reservationsToInsert.map((row) => row.name))];
  const missingNames = neededNames.filter((name) => !nameToId.has(name.toLowerCase()));
  for (const group of chunk(missingNames, 200)) {
    if (group.length === 0) continue;
    await db.insert(guests).values(group.map((name) => ({ name })));
  }

  const guestsNow = await db.select({ id: guests.id, name: guests.name }).from(guests);
  nameToId.clear();
  for (const guest of guestsNow) {
    const key = guest.name.toLowerCase();
    if (!nameToId.has(key)) nameToId.set(key, guest.id);
  }

  const reservationRecords: Array<{
    id: number;
    externalId: string;
    roomId: string;
    bedId: string;
    name: string;
    start: string;
    end: string;
    nights: SheetNight[];
  }> = [];

  for (const group of chunk(reservationsToInsert, 120)) {
    const inserted = await db
      .insert(reservations)
      .values(
        group.map((row) => {
          const checkOut = addOneDay(row.end);
          return {
            externalId: `sheet:${row.syncKey}`,
            source: "manual",
            guestId: nameToId.get(row.name.toLowerCase())!,
            checkIn: row.start,
            checkOut,
            roomTypeReq: row.roomId === "4B" ? "female" : "mixed",
            preferredRoomId: row.roomId,
            numGuests: 1,
            paymentStatus: "unpaid",
            status: "confirmed",
            rawData: JSON.stringify({
              source: "excel-sheet",
              sheet: row.sheet,
              roomId: row.roomId,
              bedId: row.bedId,
              guestName: row.name,
              checkIn: row.start,
              checkOut,
            }),
          };
        })
      )
      .returning({ id: reservations.id, externalId: reservations.externalId });

    for (let idx = 0; idx < inserted.length; idx += 1) {
      const row = group[idx];
      reservationRecords.push({
        id: inserted[idx].id,
        externalId: inserted[idx].externalId ?? `sheet:${row.syncKey}`,
        roomId: row.roomId,
        bedId: row.bedId,
        name: row.name,
        start: row.start,
        end: row.end,
        nights: row.nights,
      });
    }
  }

  const assignments = reservationRecords.flatMap((reservation) => {
    const rowsOut: Array<{
      reservationId: number;
      bedId: string;
      date: string;
      guestName: string;
      isManual: number;
    }> = [];
    for (const night of reservation.nights) {
      rowsOut.push({
        reservationId: reservation.id,
        bedId: night.bedId,
        date: night.date,
        guestName: reservation.name,
        isManual: 1,
      });
    }
    return rowsOut;
  });

  for (const group of chunk(assignments, 200)) {
    await db.insert(bedAssignments).values(group);
  }

  return Response.json({
    ok: true,
    rows: sheetRows.length,
    deleteFrom,
    deleteUntil,
    reservations: reservationRecords.length,
    assignments: assignments.length,
    overlap: reservationRecords.length,
    assignmentCount: assignments.length,
    replacedReservations: replacedRows.length,
    replacedNames,
    warning: replacedRows.length > 0
      ? `Excel sync replaced app reservations from ${deleteFrom} to ${deleteUntil}.`
      : null,
  });
}
