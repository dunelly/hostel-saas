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
// Subject patterns:
//   "New Booking Confirmation - HW1234567"
//   "Booking Confirmation #HW-1234567"
//   "New reservation from [Name]"

export function parseHostelworldEmail(
  subject: string,
  body: string
): ParsedReservation | null {
  const text = stripHtml(body);
  const full = subject + "\n" + text;

  // Booking reference — HW prefix common
  const idMatch =
    full.match(/(?:HW|HB)[- ]?(\d{5,12})/i) ||
    full.match(/[Bb]ooking\s*(?:reference|ref|#|ID|number)?:?\s*#?([A-Z]{0,3}\d{6,12})/i) ||
    full.match(/[Cc]onfirmation\s*#?\s*([A-Z]{0,3}\d{6,12})/i);
  if (!idMatch) return null;
  const externalId = `HW-${idMatch[1]}`;

  // Guest name
  const nameMatch =
    full.match(/[Gg]uest\s*(?:name)?:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/) ||
    full.match(/[Nn]ame:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/) ||
    subject.match(/[Cc]onfirmation[^-]*-\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
  if (!nameMatch) return null;
  const guestName = nameMatch[1].trim();

  // Dates
  const checkIn = extractHostelworldDate(full, ["arrival", "check.?in", "arriving"]);
  const checkOut = extractHostelworldDate(full, ["departure", "check.?out", "departing"]);
  if (!checkIn || !checkOut) return null;

  // Number of guests
  const guestsMatch = full.match(/(\d+)\s+(?:guest|person|adult|bed)/i);
  const numGuests = guestsMatch ? parseInt(guestsMatch[1]) : 1;

  // Price
  const { price, currency } = extractPrice(full);

  const roomTypeReq = /female|women|ladies/i.test(full) ? "female" : "mixed";

  return {
    externalId,
    source: "hostelworld",
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

function extractHostelworldDate(text: string, labels: string[]): string | null {
  for (const label of labels) {
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
  return extractBookingDate(text, labels);
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
