import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ParsedReservation } from "./parser";

const SYSTEM_PROMPT = `You parse hostel reservation emails from Hostelworld and Booking.com.

Given an email subject and body, extract reservation details as JSON.

Return EXACTLY one JSON object (no markdown, no code fences, just raw JSON):

For a booking/confirmation email:
{
  "type": "booking",
  "referenceNumber": "279366-576300005",
  "guestName": "Anna Bösl",
  "checkIn": "2026-03-25",
  "checkOut": "2026-03-26",
  "numGuests": 2,
  "roomType": "mixed" or "female",
  "totalPrice": 18.00,
  "currency": "USD",
  "source": "hostelworld" or "booking.com"
}

For a cancellation email:
{
  "type": "cancellation",
  "referenceNumber": "279366-576300005",
  "source": "hostelworld" or "booking.com"
}

If the email is not a reservation or cancellation, return:
{ "type": "unknown" }

Rules:
- referenceNumber: the booking reference (e.g. "279366-576300005" for Hostelworld, or a 10-digit number for Booking.com)
- Dates must be YYYY-MM-DD format
- checkOut = arrival date + number of nights
- roomType: "female" if the room mentions female/women only, otherwise "mixed"
- source: "hostelworld" if from hostelworld.com, "booking.com" if from booking.com
- For cancellation emails, you only need type, referenceNumber, and source`;

let model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]> | null = null;

function getModel() {
  if (model) return model;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  return model;
}

interface GeminiBookingResult {
  type: "booking";
  referenceNumber: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  numGuests: number;
  roomType: "mixed" | "female";
  totalPrice: number | null;
  currency: string;
  source: "hostelworld" | "booking.com";
}

interface GeminiCancellationResult {
  type: "cancellation";
  referenceNumber: string;
  source: "hostelworld" | "booking.com";
}

interface GeminiUnknownResult {
  type: "unknown";
}

type GeminiResult = GeminiBookingResult | GeminiCancellationResult | GeminiUnknownResult;

export async function parseEmailWithGemini(
  subject: string,
  body: string
): Promise<{ reservation: ParsedReservation | null; cancellationId: string | null }> {
  const m = getModel();

  const prompt = `Subject: ${subject}\n\nBody:\n${body.substring(0, 3000)}`;

  const result = await m.generateContent([
    { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + prompt }] },
  ] as any);

  const text = result.response.text().trim();

  // Strip markdown code fences if present
  const jsonStr = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: GeminiResult;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { reservation: null, cancellationId: null };
  }

  if (parsed.type === "cancellation") {
    const ref = parsed.referenceNumber.replace(/-/g, "");
    const prefix = parsed.source === "hostelworld" ? "HW-" : "BC-";
    return { reservation: null, cancellationId: `${prefix}${ref}` };
  }

  if (parsed.type === "booking") {
    const b = parsed as GeminiBookingResult;
    if (!b.referenceNumber || !b.guestName || !b.checkIn || !b.checkOut) {
      return { reservation: null, cancellationId: null };
    }

    const ref = b.referenceNumber.replace(/-/g, "");
    const prefix = b.source === "hostelworld" ? "HW-" : "BC-";

    return {
      reservation: {
        externalId: `${prefix}${ref}`,
        source: b.source,
        guestName: b.guestName,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        roomTypeReq: b.roomType || "mixed",
        numGuests: b.numGuests || 1,
        totalPrice: b.totalPrice ?? null,
        currency: b.currency || "USD",
        rawData: body.substring(0, 1000),
      },
      cancellationId: null,
    };
  }

  return { reservation: null, cancellationId: null };
}
