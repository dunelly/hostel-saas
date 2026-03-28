/**
 * Email parsers for Booking.com and Hostelworld confirmation emails.
 * Each OTA sends a structured confirmation email to the property inbox.
 */

export interface ParsedReservation {
  externalId: string;
  source: "booking.com" | "hostelworld";
  guestName: string;
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  roomTypeReq: "mixed" | "female";
  numGuests: number;
  totalPrice: number | null;
  currency: string;
  rawData: string;
}

// ─── Booking.com ─────────────────────────────────────────────────────────────
// Subject patterns:
//   "New reservation - [Name]"
//   "Reservation confirmation [ID]"
//   "New booking: [Name] ([dates])"

export function parseBookingComEmail(
  subject: string,
  body: string
): ParsedReservation | null {
  const text = stripHtml(body);
  const full = subject + "\n" + text;

  // Booking reference — 10-digit number
  const idMatch =
    full.match(/[Cc]onfirmation\s*(?:number|#|no\.?)?:?\s*(\d{8,12})/) ||
    full.match(/[Bb]ooking\s*(?:number|#|ID|reference)?:?\s*(\d{8,12})/) ||
    full.match(/\b(\d{10})\b/);
  if (!idMatch) return null;
  const externalId = idMatch[1];

  // Guest name
  const nameMatch =
    full.match(/[Gg]uest\s*(?:name)?:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/) ||
    full.match(/[Rr]eservation\s+(?:for|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/) ||
    subject.match(/[Nn]ew\s+(?:reservation|booking)[:\s-]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
  if (!nameMatch) return null;
  const guestName = nameMatch[1].trim();

  // Check-in / check-out
  const checkIn = extractBookingDate(full, ["check.?in", "arrival", "from"]);
  const checkOut = extractBookingDate(full, ["check.?out", "departure", "until", "to"]);
  if (!checkIn || !checkOut) return null;

  // Number of guests
  const guestsMatch = full.match(/(\d+)\s+(?:guest|person|adult)/i);
  const numGuests = guestsMatch ? parseInt(guestsMatch[1]) : 1;

  // Price
  const { price, currency } = extractPrice(full);

  // Room type
  const roomTypeReq = /female|women|ladies/i.test(full) ? "female" : "mixed";

  return {
    externalId,
    source: "booking.com",
    guestName,
    checkIn,
    checkOut,
    roomTypeReq,
    numGuests,
    totalPrice: price,
    currency,
    rawData: text.substring(0, 1000),
  };
}

// ─── Hostelworld ─────────────────────────────────────────────────────────────
// Exact email format:
//   (ref: 279366-576300005):
//   Anna Bösl
//   Arrival: 25th Mar 2026
//   Nights: 1
//   Guests: 2
//   Room Details:
//   25th Mar 2026: 2 Beds reserved in 8 Bed Mixed Dorm Ensuite
//   Total Price: USD 18.00
//   Deposit Paid: USD 2.70

export function parseHostelworldEmail(
  subject: string,
  body: string
): ParsedReservation | null {
  const text = stripHtml(body);
  const full = subject + "\n" + text;

  // Reference: "279366-576300005" from "(ref: 279366-576300005):"
  const refMatch = full.match(/(?:ref(?:erence)?[:\s#]*|\(ref:\s*)?(\d{5,8}-\d{7,12})\)?/i);
  if (!refMatch) return null;
  const ref = refMatch[1];

  // Guest name: first non-empty line after the ref number in the body
  const refPos = text.indexOf(ref);
  const afterRef = refPos >= 0 ? text.slice(refPos + ref.length) : text;
  const nameLines = afterRef.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const guestName = nameLines[0];
  if (!guestName || guestName.length < 2 || guestName.length > 80) return null;
  if (/^arrival|^nights|^guests|^room|^total|^deposit/i.test(guestName)) return null;

  // Arrival date
  const arrivalMatch = full.match(/Arrival:\s*(.+)/i);
  const checkIn = parseHWDate(arrivalMatch?.[1]?.trim());
  if (!checkIn) return null;

  // Checkout = arrival + nights (no explicit checkout in HW emails)
  const nightsMatch = full.match(/Nights:\s*(\d+)/i);
  const nights = parseInt(nightsMatch?.[1] ?? "1") || 1;
  const checkOut = addDaysToDate(checkIn, nights);

  // Guests count
  const guestsMatch = full.match(/Guests:\s*(\d+)/i);
  const numGuests = parseInt(guestsMatch?.[1] ?? "1") || 1;

  // Room line: "25th Mar 2026: 2 Beds reserved in 8 Bed Mixed Dorm Ensuite"
  const roomLineMatch = full.match(
    /\d+(?:st|nd|rd|th)?\s+\w+\s+\d{4}:\s*\d+\s+Beds?(?:\s+reserved)?\s+in\s+(.+)/i
  );
  const roomText = roomLineMatch?.[1]?.trim() ?? "";

  // Price: "Total Price: USD 18.00"
  const priceMatch = full.match(/Total Price:\s*([A-Z]+)\s*([\d.,]+)/i);
  const currency = priceMatch?.[1] ?? "USD";
  const totalPrice = priceMatch ? parseFloat(priceMatch[2].replace(",", ".")) : null;

  const roomTypeReq = /\bfemale\b|\bwomen\b/i.test(roomText) ? "female" : "mixed";

  return {
    externalId: `HW-${ref.replace("-", "")}`,
    source: "hostelworld",
    guestName: guestName.trim(),
    checkIn,
    checkOut,
    roomTypeReq,
    numGuests,
    totalPrice: totalPrice && totalPrice > 0 ? totalPrice : null,
    currency,
    rawData: text.substring(0, 1000),
  };
}

function parseHWDate(d: string | undefined): string | null {
  if (!d) return null;
  const s = d.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const months: Record<string, number> = {
    january:1, february:2, march:3, april:4, may:5, june:6,
    july:7, august:8, september:9, october:10, november:11, december:12,
    jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
  };

  // "25th Mar 2026" or "25 March 2026"
  const m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?\s+(\d{4})/i);
  if (m) {
    const key = m[2].toLowerCase();
    const mon = months[key] ?? months[key.slice(0, 3)];
    if (mon) return `${m[3]}-${String(mon).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }

  // Fallback — use noon to avoid UTC offset shifting the date
  try {
    const p = new Date(s + "T12:00:00");
    if (!isNaN(p.getTime())) return p.toISOString().split("T")[0];
  } catch {}
  return null;
}

function addDaysToDate(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractBookingDate(text: string, labels: string[]): string | null {
  for (const label of labels) {
    // "Check-in: 15 March 2025" or "Check-in: 2025-03-15" or "Check-in: 15/03/2025"
    const pattern = new RegExp(
      `${label}\\s*:?\\s*(\\d{1,2}[\\s/.-](?:\\w+|\\d{1,2})[\\s/.-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2})`,
      "i"
    );
    const m = text.match(pattern);
    if (m) {
      const parsed = normalizeDate(m[1]);
      if (parsed) return parsed;
    }
  }
  // Fallback: any ISO date in the text
  const isoMatches = text.match(/\d{4}-\d{2}-\d{2}/g);
  if (isoMatches) {
    // Return the first valid future-ish date
    for (const d of isoMatches) {
      if (d > "2020-01-01") return d;
    }
  }
  return null;
}


function normalizeDate(raw: string): string | null {
  try {
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();

    // Try native parse (works for "15 March 2025", "Mar 15 2025", etc.)
    const d = new Date(raw.trim());
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }

    // DD/MM/YYYY
    const ddmmyyyy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (ddmmyyyy) {
      const [, dd, mm, yyyy] = ddmmyyyy;
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
  } catch {}
  return null;
}

function extractPrice(text: string): { price: number | null; currency: string } {
  // "EUR 45.00" or "€45.00" or "45.00 EUR" or "Total: 45.00"
  const match =
    text.match(/(?:EUR|USD|GBP|£|€|\$)\s*(\d+(?:[.,]\d{2})?)/) ||
    text.match(/(\d+(?:[.,]\d{2})?)\s*(?:EUR|USD|GBP)/) ||
    text.match(/[Tt]otal(?:\s+price)?:?\s*(?:EUR|USD|GBP|£|€|\$)?\s*(\d+(?:[.,]\d{2})?)/);

  if (!match) return { price: null, currency: "EUR" };

  const price = parseFloat(match[1].replace(",", "."));

  const currencyMatch = text.match(/\b(EUR|USD|GBP)\b/);
  const symbolMatch = text.match(/[€£$]/);
  const currency = currencyMatch?.[1] ||
    (symbolMatch?.[0] === "€" ? "EUR" : symbolMatch?.[0] === "£" ? "GBP" : "USD");

  return { price: isNaN(price) ? null : price, currency };
}
