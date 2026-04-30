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

export type SheetNight = { sheet: string; roomId: string; bedId: string; date: string; name: string };
export type SheetStay = {
  sheet: string;
  roomId: string;
  bedId: string;
  name: string;
  start: string;
  end: string;
  nights: SheetNight[];
};

export function addOneDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function parseCsv(text: string): string[][] {
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

export function parseSheetRows(gid: string, rows: string[][]): SheetNight[] {
  const dates: string[] = [];
  for (const cell of rows[2] || []) {
    const match = String(cell || "").trim().match(/^(\d{1,2})-([A-Za-z]{3})$/);
    if (match) {
      const month = MONTHS[match[2]];
      dates.push(`2026-${String(month).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`);
    }
  }

  const out: SheetNight[] = [];

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

export function parseSheetRowsFromCsv(gid: string, text: string): SheetNight[] {
  return parseSheetRows(gid, parseCsv(text));
}

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
  const byRoom = new Map<string, SheetStay[]>();

  for (const stay of stays) {
    const roomStays = byRoom.get(stay.roomId) || [];
    roomStays.push(stay);
    byRoom.set(stay.roomId, roomStays);
  }

  for (const roomStays of byRoom.values()) {
    const occupied = new Set<string>();

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

export function buildReservations(rows: SheetNight[]) {
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
