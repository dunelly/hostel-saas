// Background service worker: relays scraped data to the Hostel Manager API

const ALARM_BOOKING = "auto-import-booking";
const ALARM_GMAIL = "auto-sync-gmail";

// ─── Message handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RESERVATIONS_SCRAPED") {
    (async () => {
      try {
        const result = await handleImport(message.data);
        // Also cancel any cancelled reservations
        if (message.cancelledIds?.length > 0) {
          const cancelResult = await cancelReservations(message.cancelledIds);
          result.cancelled = cancelResult.cancelled || 0;
        }
        sendResponse({ success: true, result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
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
    // Respond immediately so the popup doesn't block waiting for a 40s task.
    // The import runs in the background; result is saved to storage for polling.
    chrome.storage.local.set({ lastQuickImport: { done: false, timestamp: new Date().toISOString() } });
    sendResponse({ success: true, started: true });
    quickImportInBackground()
      .then((result) => chrome.storage.local.set({ lastQuickImport: { done: true, ...result, timestamp: new Date().toISOString() } }))
      .catch((err) => chrome.storage.local.set({ lastQuickImport: { done: true, error: err.message, timestamp: new Date().toISOString() } }));
    return false; // channel already closed via sendResponse
  }

  if (message.type === "SAVE_HOTEL_ID") {
    chrome.storage.local.set({ hotelId: message.hotelId })
      .then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.type === "SET_GMAIL_AUTO_SYNC") {
    const { enabled, intervalMinutes } = message;
    setGmailAutoSync(enabled, intervalMinutes)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "TRIGGER_GMAIL_SYNC") {
    // Run in background — respond immediately, save result to storage for polling
    chrome.storage.local.set({ lastGmailSync: { done: false, timestamp: new Date().toISOString() } });
    sendResponse({ success: true, started: true });
    triggerGmailSync()
      .then((result) => chrome.storage.local.set({ lastGmailSync: { done: true, ...result, timestamp: new Date().toISOString() } }))
      .catch((err) => chrome.storage.local.set({ lastGmailSync: { done: true, error: err.message, timestamp: new Date().toISOString() } }));
    return false;
  }

  if (message.type === "GET_GMAIL_AUTO_SYNC_STATUS") {
    getGmailAutoSyncStatus()
      .then((status) => sendResponse({ success: true, status }))
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
    try {
      const result = await autoImportBooking();
      await updateLastAutoImport({ imported: result.imported || 0, duplicates: result.duplicates || 0 });
    } catch (err) {
      console.error("[Hostel Manager] Booking.com auto-import error:", err);
      await updateLastAutoImport({ imported: 0, duplicates: 0, error: err.message });
    }
  }

  if (alarm.name === ALARM_GMAIL) {
    console.log("[Hostel Manager] Gmail auto-sync alarm fired");
    try {
      const result = await triggerGmailSync();
      await chrome.storage.local.set({
        lastAutoGmailSync: { ...result, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      console.error("[Hostel Manager] Gmail auto-sync error:", err);
      await chrome.storage.local.set({
        lastAutoGmailSync: { error: err.message, timestamp: new Date().toISOString() },
      });
    }
  }
});

// ─── Build the Booking.com reservations list URL ─────────────────────────────
function buildBookingReservationsUrl(hotelId) {
  const past = new Date(Date.now() - 2 * 864e5).toISOString().split("T")[0];
  const future = new Date(Date.now() + 14 * 864e5).toISOString().split("T")[0];
  return `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/search_reservations.html?hotel_id=${hotelId}&date_from=${past}&date_to=${future}&date_type=arrival&rows=100`;
}

// ─── Wait for page to fully load after navigation ──────────────────────────
// Booking.com is JS-heavy. The browser "complete" event fires early, but the
// reservation table is rendered via AJAX afterward. This function:
// 1. Waits for the tab to start loading (confirms navigation began)
// 2. Waits for the browser "complete" event
// 3. Polls until booking number links (8-12 digits) appear in the DOM
//    — these only exist once the AJAX table data has fully rendered
async function waitForFullPageLoad(tabId, timeout = 60000) {
  const start = Date.now();

  // Step 1: Wait for tab to enter "loading" state (navigation started)
  console.log("[Hostel Manager] Waiting for navigation to start...");
  const loadingDeadline = start + 10000;
  while (Date.now() < loadingDeadline) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === "loading") {
        console.log("[Hostel Manager] Navigation started");
        break;
      }
    } catch (e) {}
    await sleep(200);
  }

  // Step 2: Wait for browser "complete" (DOM loaded)
  console.log("[Hostel Manager] Waiting for DOM complete...");
  const completeDeadline = start + 30000;
  while (Date.now() < completeDeadline) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === "complete") {
        console.log("[Hostel Manager] DOM complete");
        break;
      }
    } catch (e) {}
    await sleep(500);
  }

  // Step 3: Poll for actual reservation data (AJAX content)
  console.log("[Hostel Manager] Waiting for reservation table data...");
  const contentDeadline = start + timeout;
  while (Date.now() < contentDeadline) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Look for 8-12 digit booking number links
          let bookingNums = 0;
          for (const a of document.querySelectorAll("a")) {
            if (/^\d{8,12}$/.test(a.textContent.trim())) bookingNums++;
          }
          // Also detect if page is still loading (skeleton placeholders)
          // Skeleton rows have no text content in <td> cells
          const rows = document.querySelectorAll("tr");
          let skeletonRows = 0;
          for (const row of rows) {
            const tds = row.querySelectorAll("td");
            if (tds.length > 3 && row.textContent.trim().length < 10) skeletonRows++;
          }
          return { bookingNums, skeletonRows, totalRows: rows.length };
        },
      });
      const { bookingNums, skeletonRows, totalRows } = result?.result || {};
      console.log(`[Hostel Manager] Content check: ${bookingNums} bookings, ${skeletonRows} skeleton rows, ${totalRows} total rows`);

      if (bookingNums > 0) {
        console.log(`[Hostel Manager] Page content ready: ${bookingNums} booking numbers found`);
        return true;
      }

      // If there are skeleton rows, page is still loading — keep waiting
      if (skeletonRows > 0) {
        console.log("[Hostel Manager] Skeleton loading detected, still waiting...");
      }
    } catch (e) {
      console.log(`[Hostel Manager] Content check error: ${e.message}`);
    }
    await sleep(3000);
  }
  console.log("[Hostel Manager] Timed out waiting for page content");
  return false;
}

// ─── Scrape via content script (with retries) ───────────────────────────────
async function scrapeExistingTab(tab) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_BOOKING_PAGE" });
      const reservations = response?.reservations || [];
      const cancelledIds = response?.cancelledIds || [];
      console.log(`[Hostel Manager] Scrape attempt ${attempt + 1}: found ${reservations.length} reservations, ${cancelledIds.length} cancelled`);
      if (reservations.length > 0 || cancelledIds.length > 0) return { reservations, cancelledIds };
    } catch (e) {
      console.log(`[Hostel Manager] Scrape attempt ${attempt + 1}: content script not ready (${e.message})`);
    }
    await sleep(3000);
  }
  return { reservations: [], cancelledIds: [] };
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
    tab = existingTabs[0];
    await chrome.tabs.update(tab.id, { url });
  } else {
    tab = await chrome.tabs.create({ url, active: false });
  }

  const contentReady = await waitForFullPageLoad(tab.id, 60000);
  if (!contentReady) {
    console.log("[Hostel Manager] autoImport: table didn't load, trying scrape anyway");
  }
  // Wait for content script to be injected and ready
  await sleep(3000);

  const { reservations, cancelledIds } = await scrapeExistingTab(tab);
  if (reservations.length === 0 && cancelledIds.length === 0) {
    return { imported: 0, duplicates: 0, cancelled: 0, message: "No reservations found" };
  }
  const result = reservations.length > 0 ? await handleImport(reservations) : { imported: 0, duplicates: 0 };
  if (cancelledIds.length > 0) {
    const cancelResult = await cancelReservations(cancelledIds);
    result.cancelled = cancelResult.cancelled || 0;
  }
  return result;
}

// ─── Quick import: navigate to fresh URL, wait for content, scrape, import ──
async function quickImportInBackground() {
  console.log("[Hostel Manager] quickImport: starting");
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
    console.log("[Hostel Manager] quickImport: no hotel ID");
    return { done: true, message: "No hotel ID found. Enter it in extension settings." };
  }

  const url = buildBookingReservationsUrl(hotelId);
  console.log("[Hostel Manager] quickImport: navigating to", url);
  const existingTabs = await chrome.tabs.query({ url: "https://admin.booking.com/*" });
  let tab;
  if (existingTabs.length > 0) {
    tab = existingTabs[0];
    await chrome.tabs.update(tab.id, { url });
    console.log("[Hostel Manager] quickImport: refreshed existing tab", tab.id);
  } else {
    tab = await chrome.tabs.create({ url, active: false });
    console.log("[Hostel Manager] quickImport: created new tab", tab.id);
  }

  console.log("[Hostel Manager] quickImport: waiting for full page load...");
  const contentReady = await waitForFullPageLoad(tab.id, 60000);
  if (!contentReady) {
    console.log("[Hostel Manager] quickImport: table didn't render in time");
    return { done: true, message: "Page loaded but reservations table didn't appear — make sure you are logged in to Booking.com" };
  }
  // Wait for content script to be injected and ready
  await sleep(3000);

  console.log("[Hostel Manager] quickImport: scraping via content script...");
  const { reservations, cancelledIds } = await scrapeExistingTab(tab);
  if (reservations.length === 0 && cancelledIds.length === 0) {
    return { done: true, message: "Page loaded but no reservations found to import" };
  }

  console.log(`[Hostel Manager] quickImport: importing ${reservations.length} reservations, ${cancelledIds.length} cancelled`);
  const result = reservations.length > 0 ? await handleImport(reservations) : { imported: 0, duplicates: 0 };
  if (cancelledIds.length > 0) {
    const cancelResult = await cancelReservations(cancelledIds);
    result.cancelled = cancelResult.cancelled || 0;
  }
  return { done: true, imported: result.imported, duplicates: result.duplicates, cancelled: result.cancelled || 0 };
}


async function sleep(ms) {
  // Break into 500ms chunks with a Chrome API call each iteration to keep
  // the MV3 service worker alive (setTimeout alone won't prevent suspension).
  let remaining = ms;
  while (remaining > 0) {
    const chunk = Math.min(500, remaining);
    await new Promise(resolve => setTimeout(resolve, chunk));
    await chrome.storage.local.get("_keepalive"); // ping Chrome to stay alive
    remaining -= chunk;
  }
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
    appUrl2: "",
    apiKey: "hostel-dev-key-change-me",
  });
}

async function handleImport(reservations) {
  const urls = await getUrls();
  const { apiKey } = await getSettings();
  const body = JSON.stringify({ reservations });
  const headers = { "Content-Type": "application/json", "x-api-key": apiKey };

  let result = null;
  for (const url of urls) {
    try {
      const response = await fetch(`${url}/api/import`, { method: "POST", headers, body });
      if (response.ok && !result) {
        result = await response.json();
      }
    } catch (e) {
      console.warn(`[Hostel Manager] Import to ${url} failed:`, e.message);
    }
  }

  if (!result) throw new Error("Import failed on all servers");

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

async function getUrls() {
  const { appUrl, appUrl2 } = await getSettings();
  return [appUrl, appUrl2].filter(Boolean);
}

async function testConnection() {
  const urls = await getUrls();
  const results = [];

  for (const url of urls) {
    try {
      const response = await fetch(`${url}/api/rooms`);
      if (response.ok) {
        const rooms = await response.json();
        results.push({ url, rooms: rooms.length });
      }
    } catch (e) {}
  }

  if (results.length === 0) throw new Error("Connection failed");
  return { connected: true, rooms: results[0].rooms, connectedUrls: results.length };
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

// ─── Gmail auto-sync ─────────────────────────────────────────────────────────

async function triggerGmailSync() {
  const urls = await getUrls();
  const headers = { "Content-Type": "application/json" };
  const body = JSON.stringify({});

  let result = null;
  for (const url of urls) {
    try {
      const response = await fetch(`${url}/api/gmail/sync`, { method: "POST", headers, body });
      if (response.ok && !result) {
        result = await response.json();
      }
    } catch (e) {
      console.warn(`[Hostel Manager] Gmail sync to ${url} failed:`, e.message);
    }
  }

  if (!result) throw new Error("Gmail sync failed on all servers");
  return result;
}

async function setGmailAutoSync(enabled, intervalMinutes = 60) {
  await chrome.alarms.clear(ALARM_GMAIL);

  if (enabled) {
    chrome.alarms.create(ALARM_GMAIL, {
      delayInMinutes: intervalMinutes,
      periodInMinutes: intervalMinutes,
    });
  }

  await chrome.storage.local.set({
    autoSyncGmail: { enabled, intervalMinutes },
  });
}

async function getGmailAutoSyncStatus() {
  const stored = await chrome.storage.local.get({
    autoSyncGmail: { enabled: false, intervalMinutes: 60 },
    lastAutoGmailSync: null,
  });
  const alarm = await chrome.alarms.get(ALARM_GMAIL);
  return {
    ...stored.autoSyncGmail,
    nextFireTime: alarm ? new Date(alarm.scheduledTime).toISOString() : null,
    lastSync: stored.lastAutoGmailSync,
  };
}

// ─── Cancel reservations by externalId ────────────────────────────────────────
async function cancelReservations(externalIds) {
  const urls = await getUrls();
  const { apiKey } = await getSettings();
  const body = JSON.stringify({ externalIds });
  const headers = { "Content-Type": "application/json", "x-api-key": apiKey };

  let result = null;
  for (const url of urls) {
    try {
      const response = await fetch(`${url}/api/reservations/cancel`, { method: "POST", headers, body });
      if (response.ok && !result) {
        result = await response.json();
      }
    } catch (e) {
      console.warn(`[Hostel Manager] Cancel to ${url} failed:`, e.message);
    }
  }

  if (!result) throw new Error("Cancel failed on all servers");
  return result;
}

// ─── On install / service worker restart: restore alarms ─────────────────────
async function restoreAlarms() {
  const stored = await chrome.storage.local.get({
    autoImportBooking: { enabled: false, intervalMinutes: 30 },
    autoSyncGmail: { enabled: false, intervalMinutes: 60 },
  });
  const bookingAlarm = await chrome.alarms.get(ALARM_BOOKING);
  if (stored.autoImportBooking.enabled && !bookingAlarm) {
    await setAutoImport(true, stored.autoImportBooking.intervalMinutes);
  }
  const gmailAlarm = await chrome.alarms.get(ALARM_GMAIL);
  if (stored.autoSyncGmail.enabled && !gmailAlarm) {
    await setGmailAutoSync(true, stored.autoSyncGmail.intervalMinutes);
  }
}

chrome.runtime.onInstalled.addListener(restoreAlarms);
restoreAlarms();
