// Background service worker: relays scraped data to the Hostel Manager API

const ALARM_BOOKING = "auto-import-booking";
const ALARM_GMAIL   = "auto-import-gmail";

// ─── Message handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RESERVATIONS_SCRAPED") {
    handleImport(message.data)
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "TEST_CONNECTION") {
    testConnection()
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "SET_AUTO_IMPORT") {
    const { source, enabled, intervalMinutes } = message;
    setAutoImport(source, enabled, intervalMinutes)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "GET_AUTO_IMPORT_STATUS") {
    getAutoImportStatus()
      .then((status) => sendResponse({ success: true, status }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "QUICK_IMPORT") {
    quickImportInBackground(message.source || "booking")
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "SAVE_HOTEL_ID") {
    chrome.storage.local.set({ hotelId: message.hotelId })
      .then(() => sendResponse({ success: true }));
    return true;
  }

  // Gmail sync (Hostelworld emails via Gmail API)
  if (message.type === "GMAIL_API_IMPORT") {
    gmailApiImport(message.token)
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Bulk Gmail import (from content script "Import All" button)
  if (message.type === "BULK_GMAIL_IMPORT") {
    bulkGmailImport(message.threads)
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Cancel reservations by externalId
  if (message.type === "CANCEL_RESERVATIONS") {
    cancelReservations(message.externalIds)
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ─── Alarm fires → auto import ────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_BOOKING) {
    console.log("[Hostel Manager] Booking.com auto-import alarm fired");
    const bookingTabs = await chrome.tabs.query({ url: "https://admin.booking.com/*" });
    let imported = 0, duplicates = 0;
    for (const tab of bookingTabs) {
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: scrapeBookingComPage,
        });
        const reservations = result?.result || [];
        console.log(`[Hostel Manager] Scraped ${reservations.length} reservations from open tab`);
        if (reservations.length > 0) {
          const r = await handleImport(reservations);
          imported += r.imported || 0;
          duplicates += r.duplicates || 0;
        }
      } catch (err) {
        console.error("[Hostel Manager] Booking.com auto-import error:", err);
      }
    }
    await updateLastAutoImport("booking", { imported, duplicates });
  }

  if (alarm.name === ALARM_GMAIL) {
    console.log("[Hostel Manager] Gmail auto-import alarm fired");
    try {
      const gmailResult = await gmailApiImport();
      console.log("[Hostel Manager] Gmail auto-import:", gmailResult);
      await updateLastAutoImport("gmail", {
        imported: gmailResult.imported || 0,
        duplicates: gmailResult.duplicates || 0,
      });
    } catch (err) {
      console.warn("[Hostel Manager] Gmail auto-import skipped:", err.message);
    }
  }
});

// Runs inside the tab — calls the scraper and returns reservations
function triggerScrapeInTab() {
  // Booking.com scraper
  function scrapeBookingCom() {
    const reservations = [];

    // Strategy: links with res_id
    const links = document.querySelectorAll('a[href*="res_id="], a[href*="/reservation/"]');
    const seen = new Set();

    for (const link of links) {
      try {
        const url = new URL(link.href, window.location.href);
        const resId = url.searchParams.get("res_id") ||
          url.pathname.match(/\/reservation\/(\d+)/)?.[1];
        if (!resId || seen.has(resId)) continue;
        seen.add(resId);

        const row = link.closest("tr, [class*='row'], [class*='item'], li");
        if (!row) continue;

        const text = row.textContent;
        const dates = text.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/gi);
        if (!dates || dates.length < 2) continue;

        const nameEl = row.querySelector('[class*="guest"], [class*="name"], strong, b, td:first-child');
        const guestName = nameEl?.textContent?.trim();
        if (!guestName || guestName.length < 2) continue;

        const ci = new Date(dates[0]);
        const co = new Date(dates[1]);
        if (isNaN(ci) || isNaN(co)) continue;

        reservations.push({
          externalId: `BC-${resId}`,
          source: "booking.com",
          guestName,
          checkIn: ci.toISOString().split("T")[0],
          checkOut: co.toISOString().split("T")[0],
          numGuests: 1,
          roomTypeReq: text.toLowerCase().includes("female") ? "female" : "mixed",
          preferredRoom: detectPreferredRoom(text),
        });
      } catch (e) {}
    }

    return reservations;
  }

  // Hostelworld scraper
  function scrapeHostelworld() {
    const reservations = [];
    const links = document.querySelectorAll('a[href*="/booking"], a[href*="booking_id="]');
    const seen = new Set();

    for (const link of links) {
      try {
        const url = new URL(link.href, window.location.href);
        const bookingId = url.searchParams.get("booking_id") ||
          url.pathname.match(/\/bookings?\/(\d+)/)?.[1];
        if (!bookingId || seen.has(bookingId)) continue;
        seen.add(bookingId);

        const row = link.closest("tr, [class*='row'], [class*='item'], li");
        if (!row) continue;

        const text = row.textContent;
        const dates = text.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/gi);
        if (!dates || dates.length < 2) continue;

        const nameEl = row.querySelector('[class*="guest"], [class*="name"], strong, b, td:first-child');
        const guestName = nameEl?.textContent?.trim();
        if (!guestName || guestName.length < 2) continue;

        const ci = new Date(dates[0]);
        const co = new Date(dates[1]);
        if (isNaN(ci) || isNaN(co)) continue;

        reservations.push({
          externalId: `HW-${bookingId}`,
          source: "hostelworld",
          guestName,
          checkIn: ci.toISOString().split("T")[0],
          checkOut: co.toISOString().split("T")[0],
          numGuests: 1,
          roomTypeReq: row.textContent.toLowerCase().includes("female") ? "female" : "mixed",
          preferredRoom: detectPreferredRoom(row.textContent),
        });
      } catch (e) {}
    }

    return reservations;
  }

  const isBooking = window.location.href.includes("admin.booking.com");
  const isHW = window.location.href.includes("hostelworld.com");

  if (!isBooking && !isHW) return { reservations: [], reason: "Not on OTA page" };

  const reservations = isBooking ? scrapeBookingCom() : scrapeHostelworld();
  return { reservations };
}

// ─── Quick import: scrape from an already-open Booking.com tab ───────────────
async function quickImportInBackground(source) {
  // Find any already-open Booking.com extranet tab
  const bookingTabs = await chrome.tabs.query({ url: "https://admin.booking.com/*" });

  if (bookingTabs.length === 0) {
    // No tab open — open the reservations page for the user to log in / browse
    const stored = await chrome.storage.local.get({ hotelId: "" });
    const hotelId = stored.hotelId;
    const today = new Date().toISOString().split("T")[0];
    const future = new Date(Date.now() + 30 * 864e5).toISOString().split("T")[0];
    const url = hotelId
      ? `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/search_reservations.html?hotel_id=${hotelId}&upcoming_reservations=1&date_from=${today}&date_to=${future}&date_type=arrival`
      : "https://admin.booking.com";
    await chrome.tabs.create({ url, active: true });
    return { imported: 0, duplicates: 0, message: "No Booking.com tab open — opened one for you. Go to the Reservations page, then click Booking.com sync again." };
  }

  // Use the first matching tab (already loaded, content script already running)
  const tab = bookingTabs[0];

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: scrapeBookingComPage,
  });

  const reservations = result?.result || [];
  console.log(`[Hostel Manager] Scraped ${reservations.length} reservations from open tab`);

  if (reservations.length === 0) {
    // Navigate to the reservations list in that tab
    const stored = await chrome.storage.local.get({ hotelId: "" });
    const hotelId = stored.hotelId;
    if (hotelId) {
      const today = new Date().toISOString().split("T")[0];
      const future = new Date(Date.now() + 30 * 864e5).toISOString().split("T")[0];
      const url = `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/search_reservations.html?hotel_id=${hotelId}&upcoming_reservations=1&date_from=${today}&date_to=${future}&date_type=arrival`;
      await chrome.tabs.update(tab.id, { url, active: true });
      return { imported: 0, duplicates: 0, message: "Navigated your Booking.com tab to the Reservations page — wait for it to load, then click Booking.com sync again." };
    }
    return { imported: 0, duplicates: 0, message: "No reservations found — make sure you are on the Reservations list page in Booking.com." };
  }

  const importResult = await handleImport(reservations);
  return importResult;
}

function waitForTabLoad(tabId, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(); // Continue anyway after timeout
    }, timeout);

    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Maps Booking.com room type name → hostel room ID(s)
// Update this if room names change in the Booking.com extranet.
function detectPreferredRoom(text) {
  if (!text) return undefined;
  const t = text.toUpperCase();
  // Order matters: check R3 before R1/R2 to avoid partial matches
  if (/\bR3\b/.test(t)) return "3A,3B";   // Balcony R3 → Room 3A or 3B
  if (/\bR2\b/.test(t)) return "2A";       // Balcony Room R2 → Room 2A
  if (/\bR1\b/.test(t)) return "1A";       // Balcony Room R1 → Room 1A
  if (/10.BED|WINDOW/.test(t)) return "5A"; // 10-Bed / Window → Room 5A
  if (/\bFEMALE\b/.test(t)) return "4B";   // Female dorm → Room 4B
  return undefined;
}

// This function runs inside the Booking.com tab — mirrors content script logic exactly
function scrapeBookingComPage() {
  const months = {
    jan:0, feb:1, mar:2, apr:3, may:4, jun:5,
    jul:6, aug:7, sep:8, oct:9, nov:10, dec:11,
  };

  function detectPreferredRoom(text) {
    if (!text) return undefined;
    const t = text.toUpperCase();
    if (/\bR3\b/.test(t)) return "3A,3B";
    if (/\bR2\b/.test(t)) return "2A";
    if (/\bR1\b/.test(t)) return "1A";
    if (/10.BED|WINDOW/.test(t)) return "5A";
    if (/\bFEMALE\b/.test(t)) return "4B";
    return undefined;
  }

  function extractDates(text) {
    const dates = [];
    // "Mar 27, 2026" format
    const p1 = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})\b/gi;
    let m;
    while ((m = p1.exec(text)) !== null) {
      const mo = months[m[1].toLowerCase()];
      const day = parseInt(m[2]), year = parseInt(m[3]);
      if (mo !== undefined && day >= 1 && day <= 31 && year >= 2020 && year <= 2035) {
        dates.push(`${year}-${String(mo+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`);
      }
    }
    // "27 Mar 2026" format
    const p2 = /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/gi;
    while ((m = p2.exec(text)) !== null) {
      const day = parseInt(m[1]), mo = months[m[2].toLowerCase()], year = parseInt(m[3]);
      if (mo !== undefined && day >= 1 && day <= 31 && year >= 2020 && year <= 2035) {
        const ds = `${year}-${String(mo+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
        if (!dates.includes(ds)) dates.push(ds);
      }
    }
    // ISO "2026-03-27" format
    const p3 = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((m = p3.exec(text)) !== null) {
      if (!dates.includes(m[0])) dates.push(m[0]);
    }
    return dates.sort();
  }

  function extractFirstDate(text) {
    const d = extractDates(text.trim());
    return d.length > 0 ? d[0] : null;
  }

  const reservations = [];
  const seen = new Set();
  const resLinks = document.querySelectorAll('a[href*="res_id="]');

  for (const link of resLinks) {
    try {
      const url = new URL(link.href, window.location.href);
      const resId = url.searchParams.get("res_id");
      if (!resId || seen.has(resId)) continue;

      const guestName = link.textContent.trim();
      if (!guestName || /^\d+$/.test(guestName) || guestName.length < 2) continue;

      seen.add(resId);

      const row = link.closest("tr.bui-table__row, tr");
      if (!row) continue;

      const rowText = row.textContent;
      if (/\bCanceled\b/i.test(rowText) || /\bCancelled\b/i.test(rowText)) continue;

      const cells = row.querySelectorAll("td");
      let checkIn = null, checkOut = null;

      if (cells.length >= 3) {
        checkIn = extractFirstDate(cells[1].textContent);
        checkOut = extractFirstDate(cells[2].textContent);
      }

      if (!checkIn || !checkOut) {
        const allDates = extractDates(rowText);
        if (allDates.length >= 2) {
          checkIn = allDates.length >= 3 ? allDates[1] : allDates[0];
          checkOut = allDates.length >= 3 ? allDates[2] : allDates[1];
        }
      }

      if (!checkIn || !checkOut) continue;

      const isFemale = /\bFEMALE\b/i.test(rowText) || /\bwomen\s*only\b/i.test(rowText);
      const guestMatch = rowText.match(/(\d+)\s+adults?/i);
      const priceMatch = rowText.match(/VND\s+([\d,]+)/);
      const totalPrice = priceMatch ? parseInt(priceMatch[1].replace(/,/g, "")) || undefined : undefined;
      const preferredRoom = detectPreferredRoom(rowText);

      reservations.push({
        externalId: `BC-${resId}`,
        source: "booking.com",
        guestName,
        checkIn,
        checkOut,
        numGuests: guestMatch ? parseInt(guestMatch[1]) : 1,
        roomTypeReq: isFemale ? "female" : "mixed",
        preferredRoom,
        totalPrice: totalPrice > 0 ? totalPrice : undefined,
        currency: "VND",
      });
    } catch (e) {}
  }

  return reservations;
}

// ─── Core functions ───────────────────────────────────────────────────────────

async function getSettings() {
  return chrome.storage.local.get({
    appUrl: "http://localhost:3000",
    apiKey: "hostel-dev-key-change-me",
  });
}

async function handleImport(reservations) {
  const { appUrl, apiKey } = await getSettings();

  const response = await fetch(`${appUrl}/api/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reservations, apiKey }),
  });

  if (!response.ok) {
    throw new Error(`Import failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  await chrome.storage.local.set({
    lastImport: {
      timestamp: new Date().toISOString(),
      imported: result.imported,
      duplicates: result.duplicates,
      source: reservations[0]?.source || "unknown",
    },
  });

  return result;
}

async function testConnection() {
  const { appUrl } = await getSettings();
  const response = await fetch(`${appUrl}/api/rooms`);
  if (!response.ok) throw new Error("Connection failed");
  const rooms = await response.json();
  return { connected: true, rooms: rooms.length };
}

async function setAutoImport(source, enabled, intervalMinutes = 30) {
  const alarmName = source === "gmail" ? ALARM_GMAIL : ALARM_BOOKING;
  const storageKey = source === "gmail" ? "autoImportGmail" : "autoImportBooking";

  await chrome.alarms.clear(alarmName);

  if (enabled) {
    chrome.alarms.create(alarmName, {
      delayInMinutes: intervalMinutes,
      periodInMinutes: intervalMinutes,
    });
  }

  await chrome.storage.local.set({
    [storageKey]: { enabled, intervalMinutes },
  });
}

async function getAutoImportStatus() {
  const stored = await chrome.storage.local.get({
    autoImportBooking: { enabled: false, intervalMinutes: 30 },
    autoImportGmail:   { enabled: false, intervalMinutes: 30 },
  });
  const [alarmB, alarmG] = await Promise.all([
    chrome.alarms.get(ALARM_BOOKING),
    chrome.alarms.get(ALARM_GMAIL),
  ]);
  return {
    booking: {
      ...stored.autoImportBooking,
      nextFireTime: alarmB ? new Date(alarmB.scheduledTime).toISOString() : null,
    },
    gmail: {
      ...stored.autoImportGmail,
      nextFireTime: alarmG ? new Date(alarmG.scheduledTime).toISOString() : null,
    },
  };
}

async function updateLastAutoImport(source, info) {
  const key = source === "gmail" ? "lastAutoImportGmail" : "lastAutoImportBooking";
  await chrome.storage.local.set({
    [key]: { ...info, timestamp: new Date().toISOString() },
  });
}

// ─── Bulk Gmail import ────────────────────────────────────────────────────────
// Opens each Gmail thread URL in a background tab, extracts the email text,
// parses the Hostelworld booking format, then imports/cancels.

async function bulkGmailImport(threads) {
  const confirmed = [];
  const toCancel = [];
  const errors = [];
  const BATCH = 4; // Process 4 tabs at once

  for (let i = 0; i < threads.length; i += BATCH) {
    const batch = threads.slice(i, i + BATCH).filter(t => t.url);
    const tabs = [];

    try {
      // Open batch of background tabs
      for (const t of batch) {
        tabs.push({ tab: await chrome.tabs.create({ url: t.url, active: false }), meta: t });
      }

      // Wait for all to load
      await Promise.all(tabs.map(({ tab }) => waitForTabLoad(tab.id, 12000)));
      await sleep(2500);

      // Scrape all tabs in parallel
      const results = await Promise.all(
        tabs.map(async ({ tab, meta }) => {
          try {
            const [result] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: scrapeGmailEmailBody,
            });
            return { text: result?.result, isCancellation: meta.isCancellation };
          } catch (err) {
            return { text: null, error: err.message };
          }
        })
      );

      // Parse results
      for (const r of results) {
        if (r.error) { errors.push(r.error); continue; }
        if (!r.text) continue;
        const parsed = parseHostelworldEmail(r.text, r.isCancellation);
        if (parsed) {
          if (r.isCancellation) toCancel.push(parsed.externalId);
          else confirmed.push(parsed);
        }
      }
    } catch (err) {
      errors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${err.message}`);
    } finally {
      // Close all tabs in this batch
      for (const { tab } of tabs) {
        try { await chrome.tabs.remove(tab.id); } catch (e) {}
      }
    }
  }

  // Import confirmed bookings
  let importResult = { imported: 0, duplicates: 0, errors: [] };
  if (confirmed.length > 0) {
    importResult = await handleImport(confirmed);
  }

  // Cancel bookings
  let cancelledCount = 0;
  if (toCancel.length > 0) {
    const cancelResult = await cancelReservations(toCancel);
    cancelledCount = cancelResult.cancelled;
  }

  return {
    imported: importResult.imported,
    duplicates: importResult.duplicates,
    cancelled: cancelledCount,
    newFound: confirmed.length + toCancel.length,
    errors: [...errors, ...(importResult.errors || [])],
  };
}

// Runs inside the Gmail tab — returns the visible email body text
function scrapeGmailEmailBody() {
  // Gmail renders the latest/expanded email in .a3s.aiL
  // For threads, all expanded emails are in .a3s
  const bodies = document.querySelectorAll(".a3s.aiL, .a3s");
  for (const body of bodies) {
    const text = body.innerText || body.textContent || "";
    if (/hostelworld/i.test(text) && /arrival:/i.test(text)) {
      return text;
    }
  }
  // Fallback: return all email body text
  const fallback = document.querySelector(".a3s");
  return fallback?.innerText || null;
}

// Parse the exact Hostelworld email format:
//   (ref: 279366-576300005):
//   Guest Name
//   Arrival: 25th Mar 2026
//   Nights: 1
//   Guests: 2
//   Room Details:
//   25th Mar 2026: 2 Beds reserved in 8 Bed Mixed Dorm Ensuite
//   Total Price: USD 18.00
//   Deposit Paid: USD 2.70
function parseHostelworldEmail(text, isCancellation = false) {
  const refMatch = text.match(/(?:ref(?:erence)?[:\s#]*|\(ref:\s*)?(\d{5,8}-\d{7,12})\)?/i);
  if (!refMatch) return null;
  const ref = refMatch[1];

  // Guest name: first non-empty line after the ref
  // Strip trailing "):  " — Hostelworld format is "(ref: XXXXX-XXXXXXXXX):\n\nGuest Name"
  const afterRef = text.slice(text.indexOf(refMatch[0]) + refMatch[0].length).replace(/^[):\s]+/, '');
  const nameLines = afterRef.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const guestName = nameLines[0];
  if (!guestName || guestName.length < 2 || guestName.length > 80) return null;
  if (/^arrival|^nights|^guests|^room|^total|^deposit/i.test(guestName)) return null;

  const arrivalMatch = text.match(/Arrival:\s*(.+)/i);
  const checkIn = parseHWDate(arrivalMatch?.[1]?.trim());
  if (!checkIn) return null;

  const nightsMatch = text.match(/Nights:\s*(\d+)/i);
  const nights = parseInt(nightsMatch?.[1]) || 1;
  const checkOut = addDaysStr(checkIn, nights);

  const guestsMatch = text.match(/Guests:\s*(\d+)/i);
  const numGuests = parseInt(guestsMatch?.[1]) || 1;

  // "25th Mar 2026: 2 Beds reserved in 8 Bed Mixed Dorm Ensuite"
  const roomLineMatch = text.match(
    /\d+(?:st|nd|rd|th)?\s+\w+\s+\d{4}:\s*\d+\s+Beds?(?:\s+reserved)?\s+in\s+(.+)/i
  );
  const roomText = roomLineMatch?.[1]?.trim() || "";

  const priceMatch = text.match(/Total Price:\s*([A-Z]+)\s*([\d.,]+)/i);
  const currency = priceMatch?.[1] || "USD";
  const totalPrice = priceMatch ? parseFloat(priceMatch[2].replace(",", "")) : undefined;

  const depositMatch = text.match(/Deposit Paid:\s*[A-Z]+\s*([\d.,]+)/i);
  const amountPaid = depositMatch ? parseFloat(depositMatch[1].replace(",", "")) : 0;

  const isFemale = /\bfemale\b|\bwomen\b/i.test(roomText);

  return {
    externalId: `HW-${ref.replace("-", "")}`,
    source: "hostelworld",
    guestName: guestName.trim(),
    checkIn,
    checkOut,
    numGuests,
    roomTypeReq: isFemale ? "female" : "mixed",
    preferredRoom: detectPreferredRoom(roomText),
    totalPrice: totalPrice > 0 ? totalPrice : undefined,
    currency,
  };
}

function parseHWDate(d) {
  if (!d) return null;
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const months = {
    january:1, february:2, march:3, april:4, may:5, june:6,
    july:7, august:8, september:9, october:10, november:11, december:12,
    jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
  };

  const m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?\s+(\d{4})/i);
  if (m) {
    const mon = months[m[2].toLowerCase()] || months[m[2].toLowerCase().slice(0, 3)];
    if (mon) return `${m[3]}-${String(mon).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  try {
    const p = new Date(s);
    if (!isNaN(p.getTime())) return p.toISOString().split("T")[0];
  } catch (e) {}
  return null;
}

function addDaysStr(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

// ─── Gmail sync: tab scrape first, API fallback ──────────────────────────────

async function gmailSync() {
  // Gmail API first (fast, uses OAuth)
  return await gmailApiImport();
}

// Scrape Hostelworld emails from an open Gmail tab
async function gmailTabScrape(tab) {
  // Navigate to search for recent Hostelworld emails
  const searchUrl = "https://mail.google.com/mail/u/0/#search/from%3Ahostelworld+newer_than%3A60d";
  await chrome.tabs.update(tab.id, { url: searchUrl });
  await waitForTabLoad(tab.id, 15000);
  await sleep(3000); // Gmail needs time to render search results

  // Find Hostelworld thread rows in the search results
  const [rowResult] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const rows = document.querySelectorAll("tr[data-thread-id], tr[data-legacy-thread-id], tr");
      const threads = [];
      const seen = new Set();

      for (const row of rows) {
        const text = row.textContent || "";
        if (!/hostelworld/i.test(text)) continue;

        const isCancellation = /cancelled?\s*booking|booking.*cancel/i.test(text);

        const threadId =
          row.getAttribute("data-thread-id") ||
          row.getAttribute("data-legacy-thread-id") ||
          row.closest("[data-thread-id]")?.getAttribute("data-thread-id") ||
          row.closest("[data-legacy-thread-id]")?.getAttribute("data-legacy-thread-id");

        if (threadId && seen.has(threadId)) continue;
        if (threadId) seen.add(threadId);

        const link = row.querySelector("a[href*='#']") || row.querySelector("a[href]");
        let url = link?.href;
        if (!url && threadId) {
          url = window.location.href.split("#")[0] + "#all/" + threadId;
        }
        if (url && !seen.has(url)) {
          seen.add(url);
          threads.push({ url, isCancellation });
        }
      }
      return threads;
    },
  });

  const threads = rowResult?.result || [];
  console.log(`[Hostel Manager] Gmail tab: found ${threads.length} Hostelworld threads`);

  if (threads.length === 0) {
    return { imported: 0, duplicates: 0, cancelled: 0, newFound: 0, errors: [], message: "No Hostelworld emails found in Gmail" };
  }

  return await bulkGmailImport(threads);
}

// ─── Gmail API import ─────────────────────────────────────────────────────────
// Uses chrome.identity to get an OAuth token, then queries Gmail API directly.
// No DOM scraping — works regardless of Gmail UI changes.

async function gmailApiImport(token) {
  if (!token) token = await getGmailToken();

  // Load already-processed message IDs to avoid re-importing
  const stored = await chrome.storage.local.get({ processedGmailIds: [] });
  const processed = new Set(stored.processedGmailIds);

  // Search for confirmed and cancelled Hostelworld booking emails
  // Use broad queries — the parser validates via ref number regex
  const [confirmedIds, cancelledIds] = await Promise.all([
    searchGmail(token, 'from:hostelworld subject:(booking OR reservation) -subject:cancelled -subject:cancel'),
    searchGmail(token, 'from:hostelworld subject:(cancelled OR canceled OR cancellation)'),
  ]);
  console.log(`[Hostel Manager] Gmail search: ${confirmedIds.length} confirmed, ${cancelledIds.length} cancelled`);

  // Merge, deduplicate by message ID, cancelled takes precedence
  const messageMap = new Map();
  for (const id of confirmedIds) messageMap.set(id, false);
  for (const id of cancelledIds) messageMap.set(id, true); // overwrite if also in confirmed

  const newMessages = [...messageMap.entries()].filter(([id]) => !processed.has(id));

  const confirmed = [];
  const toCancel = [];
  const errors = [];

  for (const [id, isCancellation] of newMessages) {
    try {
      const text = await fetchEmailText(token, id);
      if (!text) {
        console.warn(`[Hostel Manager] Gmail message ${id}: no text extracted`);
        continue;
      }

      const parsed = parseHostelworldEmail(text, isCancellation);
      if (parsed) {
        if (isCancellation) toCancel.push(parsed.externalId);
        else confirmed.push(parsed);
        processed.add(id);
        console.log(`[Hostel Manager] Parsed: ${parsed.guestName} (${parsed.externalId})`);
      } else {
        console.warn(`[Hostel Manager] Gmail message ${id}: could not parse Hostelworld format`);
      }
    } catch (err) {
      errors.push(`Message ${id}: ${err.message}`);
    }
  }

  // Persist processed IDs (keep last 2000 to avoid unbounded growth)
  const trimmed = [...processed].slice(-2000);
  await chrome.storage.local.set({ processedGmailIds: trimmed });

  let importResult = { imported: 0, duplicates: 0 };
  if (confirmed.length > 0) importResult = await handleImport(confirmed);

  let cancelledCount = 0;
  if (toCancel.length > 0) {
    try {
      const r = await cancelReservations(toCancel);
      cancelledCount = r.cancelled || 0;
    } catch (e) {}
  }

  await chrome.storage.local.set({
    lastImport: {
      timestamp: new Date().toISOString(),
      imported: importResult.imported,
      duplicates: importResult.duplicates,
      source: "gmail (hostelworld)",
    },
  });

  return {
    imported: importResult.imported,
    duplicates: importResult.duplicates,
    cancelled: cancelledCount,
    newFound: newMessages.length,
    errors,
  };
}

async function getGmailToken() {
  // Called from service worker (alarm auto-sync) — must be non-interactive.
  // Interactive auth must happen from popup.js which has a window context.
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!token) {
        reject(new Error("No cached token — open the extension popup and click Sync Gmail first"));
      } else {
        resolve(token);
      }
    });
  });
}

async function searchGmail(token, query) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail search failed: ${res.status}`);
  const data = await res.json();
  return (data.messages || []).map((m) => m.id);
}

async function fetchEmailText(token, messageId) {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch message: ${res.status}`);
  const data = await res.json();
  return extractTextFromPayload(data.payload);
}

function extractTextFromPayload(payload) {
  if (!payload) return null;

  // Direct body
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart — prefer plain text
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Recurse into nested multipart
    for (const part of payload.parts) {
      const nested = extractTextFromPayload(part);
      if (nested) return nested;
    }
    // Fallback to HTML, convert to text preserving line breaks
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = decodeBase64Url(part.body.data);
        return html
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/(?:p|div|tr|li|td|h[1-6])>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/[ \t]+/g, " ")
          .replace(/\n[ \t]*/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }
    }
  }

  return null;
}

function decodeBase64Url(str) {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  // Handle UTF-8 encoding
  try {
    return decodeURIComponent(
      binary.split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
    );
  } catch (e) {
    return binary;
  }
}

// ─── Cancel reservations by externalId ────────────────────────────────────────
async function cancelReservations(externalIds) {
  const { appUrl, apiKey } = await getSettings();
  const response = await fetch(`${appUrl}/api/reservations/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ externalIds, apiKey }),
  });
  if (!response.ok) throw new Error(`Cancel failed: ${response.status}`);
  return response.json();
}

// ─── On install / service worker restart: restore alarms ─────────────────────
async function restoreAlarms() {
  const stored = await chrome.storage.local.get({
    autoImportBooking: { enabled: false, intervalMinutes: 30 },
    autoImportGmail:   { enabled: false, intervalMinutes: 30 },
  });
  const [alarmB, alarmG] = await Promise.all([
    chrome.alarms.get(ALARM_BOOKING),
    chrome.alarms.get(ALARM_GMAIL),
  ]);
  if (stored.autoImportBooking.enabled && !alarmB) {
    await setAutoImport("booking", true, stored.autoImportBooking.intervalMinutes);
  }
  if (stored.autoImportGmail.enabled && !alarmG) {
    await setAutoImport("gmail", true, stored.autoImportGmail.intervalMinutes);
  }
}

chrome.runtime.onInstalled.addListener(restoreAlarms);
restoreAlarms();
