import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getOAuthClient } from "@/lib/gmail/oauth";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseHostelworldEmail } from "@/lib/gmail/parser";

export async function GET() {
  try {
    const row = await db
      .select()
      .from(settings)
      .where(eq(settings.key, "gmail_tokens"))
      .get();

    if (!row) {
      return NextResponse.json({ error: "Gmail not connected" }, { status: 400 });
    }

    const tokens = JSON.parse(row.value);
    const client = getOAuthClient();
    client.setCredentials(tokens);

    const gmail = google.gmail({ version: "v1", auth: client });

    // Fetch ALL hostelworld booking emails
    const allMessages: { id: string }[] = [];
    let pageToken: string | undefined;
    do {
      const listRes = await gmail.users.messages.list({
        userId: "me",
        q: 'from:hostelworld.com subject:"Confirmed Booking"',
        maxResults: 100,
        pageToken,
      });
      if (listRes.data.messages) {
        allMessages.push(...(listRes.data.messages as { id: string }[]));
      }
      pageToken = listRes.data.nextPageToken ?? undefined;
    } while (pageToken && allMessages.length < 200);

    // Get subject + parse result for each
    const results: any[] = [];
    const subjectCounts: Record<string, number> = {};

    for (const msg of allMessages) {
      const full = await gmail.users.messages.get({ userId: "me", id: msg.id!, format: "full" });
      const headers = full.data.payload?.headers || [];
      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const from = headers.find((h) => h.name === "From")?.value || "";

      // Count subject patterns
      const subjectKey = subject.replace(/[-–]\s*.+$/, "").trim();
      subjectCounts[subjectKey] = (subjectCounts[subjectKey] || 0) + 1;

      const { plainText, htmlText } = extractBothParts(full.data.payload);
      const bodyUsed = plainText || htmlText || "";
      const parseResult = parseHostelworldEmail(subject, bodyUsed);

      results.push({
        id: msg.id,
        subject,
        from,
        parsed: parseResult
          ? { guestName: parseResult.guestName, checkIn: parseResult.checkIn, checkOut: parseResult.checkOut, numGuests: parseResult.numGuests, roomTypeReq: parseResult.roomTypeReq }
          : "PARSE_FAILED",
      });
    }

    return NextResponse.json({
      totalEmails: allMessages.length,
      subjectPatterns: subjectCounts,
      parsed: results.filter((r) => r.parsed !== "PARSE_FAILED").length,
      failed: results.filter((r) => r.parsed === "PARSE_FAILED").length,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

function extractBothParts(payload: any): { plainText: string | null; htmlText: string | null } {
  if (!payload) return { plainText: null, htmlText: null };

  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, "base64").toString("utf-8");
    const mime = payload.mimeType || "";
    return {
      plainText: mime === "text/plain" ? decoded : null,
      htmlText: mime === "text/html" ? decoded : null,
    };
  }

  let plainText: string | null = null;
  let htmlText: string | null = null;

  if (payload.parts) {
    for (const part of payload.parts) {
      const mime = part.mimeType || "";
      const data = part.body?.data;
      if (data) {
        const decoded = Buffer.from(data, "base64").toString("utf-8");
        if (mime === "text/plain") plainText = decoded;
        if (mime === "text/html") htmlText = decoded;
      }
      if (part.parts) {
        const nested = extractBothParts(part);
        if (nested.plainText) plainText = plainText || nested.plainText;
        if (nested.htmlText) htmlText = htmlText || nested.htmlText;
      }
    }
  }

  return { plainText, htmlText };
}
