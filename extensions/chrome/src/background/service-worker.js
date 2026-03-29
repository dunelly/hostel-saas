// Background service worker: relays scraped data to the Hostel Manager API

const ALARM_BOOKING = "auto-import-booking";

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
    const { enabled, intervalMinutes } = message;
    setAutoImport(enabled, intervalMinutes)
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
    quickImportInBackground()
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "SAVE_HOTEL_ID") {
    chrome.storage.local.set({ hotelId: message.hotelId })
      .then(() => sendResponse({ success: true }));
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
    try {
      const result = await autoImportBooking();
      await updateLastAutoImport({ imported: result.imported || 0, duplicates: result.duplicates || 0 });
    } catch (err) {
      console.error("[Hostel Manager] Booking.com auto-import error:", err);
      await updateLastAutoImport({ imported: 0, duplicates: 0, error: err.message });
    }
  }
});

// ─── Build the Booking.com reservations list URL ─────────────────────────────
function buildBookingReservationsUrl(hotelId) {
  const past = new Date(Date.now() - 2 * 864e5).toISOString().split("T")[0];
  const future = new Date(Date.now() + 90 * 864e5).toISOString().split("T")[0];
  return `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/search_reservations.html?hotel_id=${hotelId}&date_from=${past}&date_to=${future}&date_type=arrival&rows=100`;
}

// ─── Scrape an existing Booking.com tab (no navigation) ──────────────────────
async function scrapeExistingTab(tab) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_BOOKING_PAGE" });
      const reservations = response?.reservations || [];
      console.log(`[Hostel Manager] Scrape attempt ${attempt + 1}: found ${reservations.length} reservations`);
      if (reservations.length > 0) return reservations;
    } catch (e) {
      console.log(`[Hostel Manager] Scrape attempt ${attempt + 1}: content script not ready (${e.message})`);
    }
    await sleep(2000);
  }
  return [];
}

// ─── Navigate to reservations list, wait for load, scrape, import ────────────
// Used by auto-import alarms when no tab is open.
async function navigateAndScrapeBooking() {
  let hotelId = (await chrome.storage.local.get({ hotelId: "" })).hotelId;

  // Fallback: try to extract hotel_id from an already-open Booking.com tab
  if (!hotelId) {
    const openTabs = await chrome.tabs.query({ url: "https://admin.booking.com/*" });
    for (const t of openTabs) {
      try {
        const u = new URL(t.url);
        const id = u.searchParams.get("hotel_id");
        if (id) { hotelId = id; await chrome.storage.local.set({ hotelId }); break; }
      } catch (e) {}
    }
  }

  if (!hotelId) {
    return { imported: 0, duplicates: 0, message: "No hotel ID found. Visit any Booking.com extranet page or enter your Hotel ID in the extension settings." };
  }

  // Reuse autoImportBooking — same refresh-and-scrape logic
  return await autoImportBooking();
}

// ─── Auto-import (alarm): refresh existing tab or open new one ───────────────
async function autoImportBooking() {
  let hotelId = (await chrome.storage.local.get({ hotelId: "" })).hotelId;
  if (!hotelId) {
    const openTabs = await chrome.tabs.query({ url: "https://admin.booking.com/*" });
    for (const t of openTabs) {
      try {
        const id = new URL(t.url).searchParams.get("hotel_id");
        if (id) { hotelId = id; await chrome.storage.local.set({ hotelId }); break; }
      } catch (e) {}
    }
  }
  if (!hotelId) {
    return { imported: 0, duplicates: 0, message: "No hotel ID" };
  }

  const url = buildBookingReservationsUrl(hotelId);
  const existingTabs = await chrome.tabs.query({ url: "https://admin.booking.com/*" });
  let tab;

  if (existingTabs.length > 0) {
    // Refresh existing tab to get latest data
    tab = existingTabs[0];
    await chrome.tabs.update(tab.id, { url });
  } else {
    tab = await chrome.tabs.create({ url, active: false });
  }

  await waitForTabLoad(tab.id, 20000);
  await sleep(5000);

  const reservations = await scrapeExistingTab(tab);
  if (reservations.length === 0) {
    return { imported: 0, duplicates: 0, message: "No reservations found" };
  }
  return await handleImport(reservations);
}

// ─── Quick import: scrape existing tab first, navigate only if needed ────────
async function quickImportInBackground() {
  // 1. Try scraping an already-open Booking.com tab (instant, no page reload)
  const existingTabs = await chrome.tabs.query({ url: "https://admin.booking.com/*" });
  if (existingTabs.length > 0) {
    const reservations = await scrapeExistingTab(existingTabs[0]);
    if (reservations.length > 0) {
      console.log(`[Hostel Manager] Quick Sync: scraped ${reservations.length} from existing tab`);
      return await handleImport(reservations);
    }
  }

  // 2. No existing tab or no reservations found — open a new tab and scrape
  return await navigateAndScrapeBooking();
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

async function setAutoImport(enabled, intervalMinutes = 30) {
  await chrome.alarms.clear(ALARM_BOOKING);

  if (enabled) {
    chrome.alarms.create(ALARM_BOOKING, {
      delayInMinutes: intervalMinutes,
      periodInMinutes: intervalMinutes,
    });
  }

  await chrome.storage.local.set({
    autoImportBooking: { enabled, intervalMinutes },
  });
}

async function getAutoImportStatus() {
  const stored = await chrome.storage.local.get({
    autoImportBooking: { enabled: false, intervalMinutes: 30 },
  });
  const alarm = await chrome.alarms.get(ALARM_BOOKING);
  return {
    booking: {
      ...stored.autoImportBooking,
      nextFireTime: alarm ? new Date(alarm.scheduledTime).toISOString() : null,
    },
  };
}

async function updateLastAutoImport(info) {
  await chrome.storage.local.set({
    lastAutoImportBooking: { ...info, timestamp: new Date().toISOString() },
  });
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
  });
  const alarm = await chrome.alarms.get(ALARM_BOOKING);
  if (stored.autoImportBooking.enabled && !alarm) {
    await setAutoImport(true, stored.autoImportBooking.intervalMinutes);
  }
}

chrome.runtime.onInstalled.addListener(restoreAlarms);
restoreAlarms();
