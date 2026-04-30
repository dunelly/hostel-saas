import { db } from "@/lib/db";
import { guests, reservations, bedAssignments } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

const ADMIN_TOKEN = "sheet-sync-2026-04-29";
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1m1OgIVRRgZvzvd-WzOeRLVrB1EpjllN0adsc4pmNXPU/export?format=csv&gid={gid}";
const ROOM_LAYOUT: Record<string, number> = {
  "1A": 2,
  "2A": 2,
  "3A": 2,
  "3B": 2,
  "4A": 2,
  "4B": 2,
  "5A": 3,
};
const MONTHS: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

function addOneDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

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

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let quoted = false;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function cleanName(value: string): string {
  const collapsed = (value || "").replace(/\r/g, " ").replace(/\n/g, " ");
  const trimmed = collapsed.split(/\s+/).filter(Boolean).join(" ").trim();
  if (!trimmed) return "";
  const half = Math.floor(trimmed.length / 2);
  if (trimmed.length % 2 === 0 && trimmed.slice(0, half) === trimmed.slice(half)) {
    return trimmed.slice(0, half).trim();
  }
  return trimmed;
}

function isStructuralCell(value: string): boolean {
  const trimmed = cleanName(value);
  if (!trimmed) return true;
  return /\bROOM\s+[0-9AB]+\b/i.test(trimmed);
}

function hasGuestCells(row: string[] | undefined): boolean {
  return Boolean(row?.some((cell, idx) => idx > 0 && !isStructuralCell(cell)));
}

async function fetchSheetRows(gid: string) {
  const res = await fetch(SHEET_URL.replace("{gid}", gid));
  if (!res.ok) {
    throw new Error(`Failed to fetch sheet ${gid}: ${res.status}`);
  }
  const text = await res.text();
  const rows = parseCsv(text);
  const dates: string[] = [];
  for (const cell of rows[2] || []) {
    const match = String(cell || "").trim().match(/^(\d{1,2})-([A-Za-z]{3})$/);
    if (match) {
      const month = MONTHS[match[2]];
      dates.push(`2026-${String(month).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`);
    }
  }

  const out: Array<{
    sheet: string;
    roomId: string;
    bedId: string;
    date: string;
    name: string;
  }> = [];

  let i = 4;
  while (i < rows.length) {
    const row = rows[i];
    const label = row.find((cell) => /ROOM /.test(cell || ""));
    if (!label) {
      i += 1;
      continue;
    }

    const roomIdMatch = label.match(/ROOM ([0-9AB]+)/);
    if (!roomIdMatch) {
      i += 1;
      continue;
    }
    const roomId = roomIdMatch[1];
    const laneCount = ROOM_LAYOUT[roomId];
    const laneStart = hasGuestCells(rows[i + 1]) ? i + 1 : i + 2;
    const laneRows = rows.slice(laneStart, laneStart + laneCount);

    for (let laneIdx = 0; laneIdx < laneRows.length; laneIdx += 1) {
      const lane = laneRows[laneIdx];
      const bedCount = laneIdx < 2 ? 4 : 2;
      for (let dayIdx = 0; dayIdx < dates.length; dayIdx += 1) {
        const base = 1 + dayIdx * 5;
        for (let slotIdx = 0; slotIdx < bedCount; slotIdx += 1) {
          const cellIdx = base + slotIdx;
          if (cellIdx >= lane.length) continue;
          const name = cleanName(lane[cellIdx]);
          if (isStructuralCell(name)) continue;

          let bedNumber = laneIdx * 4 + slotIdx + 1;
          if (roomId === "5A" && laneIdx === 2) {
            bedNumber = 8 + slotIdx + 1;
          }

          out.push({
            sheet: gid === "923324031" ? "april" : "may",
            roomId,
            bedId: `${roomId}-${String(bedNumber).padStart(2, "0")}`,
            date: dates[dayIdx],
            name,
          });
        }
      }
    }

    i = laneStart + laneCount;
  }

  return out;
}

type SheetNight = { sheet: string; roomId: string; bedId: string; date: string; name: string };
type SheetStay = {
  sheet: string;
  roomId: string;
  bedId: string;
  name: string;
  start: string;
  end: string;
  nights: SheetNight[];
};

function getRoomBedIds(roomId: string) {
  const capacity = roomId === "5A" ? 10 : 8;
  return Array.from({ length: capacity }, (_, idx) => `${roomId}-${String(idx + 1).padStart(2, "0")}`);
}

function getStayDates(stay: SheetStay) {
  const dates: string[] = [];
  let day = stay.start;
  while (day <= stay.end) {
    dates.push(day);
    day = addOneDay(day);
  }
  return dates;
}

function stabilizeStayBeds(stays: SheetStay[]) {
  const occupiedByRoom = new Map<string, Set<string>>();
  const byRoom = new Map<string, SheetStay[]>();

  for (const stay of stays) {
    const roomStays = byRoom.get(stay.roomId) || [];
    roomStays.push(stay);
    byRoom.set(stay.roomId, roomStays);
  }

  for (const [roomId, roomStays] of byRoom.entries()) {
    const occupied = new Set<string>();
    occupiedByRoom.set(roomId, occupied);

    roomStays.sort((a, b) => {
      const aNights = getStayDates(a).length;
      const bNights = getStayDates(b).length;
      return (
        a.start.localeCompare(b.start) ||
        bNights - aNights ||
        a.name.localeCompare(b.name) ||
        a.bedId.localeCompare(b.bedId)
      );
    });

    for (const stay of roomStays) {
      const dates = getStayDates(stay);
      const originalBedIds = [...new Set(stay.nights.map((night) => night.bedId))];
      const candidates = [...originalBedIds, ...getRoomBedIds(stay.roomId).filter((bedId) => !originalBedIds.includes(bedId))];
      const stableBedId = candidates.find((bedId) => dates.every((date) => !occupied.has(`${bedId}:${date}`)));

      if (!stableBedId) {
        for (const night of stay.nights) {
          const originalKey = `${night.bedId}:${night.date}`;
          if (!occupied.has(originalKey)) {
            occupied.add(originalKey);
            continue;
          }

          const fallbackBedId = getRoomBedIds(stay.roomId).find((bedId) => !occupied.has(`${bedId}:${night.date}`));
          if (fallbackBedId) {
            night.bedId = fallbackBedId;
            occupied.add(`${fallbackBedId}:${night.date}`);
          }
        }
        continue;
      }

      stay.bedId = stableBedId;
      stay.nights = dates.map((date) => ({
        sheet: stay.sheet,
        roomId: stay.roomId,
        bedId: stableBedId,
        date,
        name: stay.name,
      }));

      for (const date of dates) {
        occupied.add(`${stableBedId}:${date}`);
      }
    }
  }

  return stays;
}

function buildReservations(rows: SheetNight[]) {
  const byBed = new Map<string, SheetNight[]>();
  for (const row of rows) {
    const list = byBed.get(row.bedId) || [];
    list.push(row);
    byBed.set(row.bedId, list);
  }
  for (const list of byBed.values()) list.sort((a, b) => a.date.localeCompare(b.date));

  const bedStays: SheetStay[] = [];

  for (const [bedId, bedRows] of byBed.entries()) {
    let current: SheetStay | null = null;

    const flush = () => {
      if (!current) return;
      bedStays.push(current);
      current = null;
    };

    for (const row of bedRows) {
      if (!current) {
        current = { ...row, bedId, start: row.date, end: row.date, nights: [row] };
        continue;
      }
      if (row.name === current.name && addOneDay(current.end) === row.date) {
        current.end = row.date;
        current.nights.push(row);
      } else {
        flush();
        current = { ...row, bedId, start: row.date, end: row.date, nights: [row] };
      }
    }
    flush();
  }

  const chains: SheetStay[] = [];
  for (const stay of bedStays.sort((a, b) => (
    a.sheet.localeCompare(b.sheet) ||
    a.roomId.localeCompare(b.roomId) ||
    a.name.localeCompare(b.name) ||
    a.start.localeCompare(b.start) ||
    a.bedId.localeCompare(b.bedId)
  ))) {
    const chain = chains.find((candidate) =>
      candidate.roomId === stay.roomId &&
      candidate.name === stay.name &&
      addOneDay(candidate.end) === stay.start
    );

    if (chain) {
      chain.end = stay.end;
      chain.nights.push(...stay.nights);
    } else {
      chains.push({ ...stay, nights: [...stay.nights] });
    }
  }

  return stabilizeStayBeds(chains);
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
  });
}
