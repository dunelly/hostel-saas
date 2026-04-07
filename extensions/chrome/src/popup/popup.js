let currentTab = null;
let currentOta = null;

document.addEventListener("DOMContentLoaded", async () => {
  // Load settings
  const stored = await chrome.storage.local.get({
    appUrl: "http://localhost:3000",
    appUrl2: "",
    apiKey: "hostel-dev-key-change-me",
    hotelId: "",
    lastImport: null,
  });

  document.getElementById("appUrl").value = stored.appUrl;
  document.getElementById("appUrl2").value = stored.appUrl2;
  document.getElementById("apiKey").value = stored.apiKey;
  document.getElementById("hotelId").value = stored.hotelId || "";

  // Show last import in Booking.com section
  if (stored.lastImport) {
    document.getElementById("bookingLastCount").textContent = `${stored.lastImport.imported} new`;
    document.getElementById("bookingLastSync").textContent = timeAgo(stored.lastImport.timestamp);
  }

  // Detect current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  const importBtn = document.getElementById("importBtn");
  const importText = document.getElementById("importBtnText");

  if (tab?.url?.includes("admin.booking.com")) {
    currentOta = "booking";
    importText.textContent = "Import from Booking.com Page";
    importBtn.disabled = false;
  } else if (tab?.url?.includes("hostelworld.com")) {
    currentOta = "hostelworld";
    importText.textContent = "Import from Hostelworld Page";
    importBtn.disabled = false;
  } else {
    importBtn.disabled = true;
  }

  // Load auto-import status (non-fatal)
  refreshAutoImportUI().catch(() => {});
  refreshGmailAutoSyncUI().catch(() => {});

  // Wire up events
  document.getElementById("quickSyncBtn").addEventListener("click", quickSync);
  document.getElementById("gmailSyncBtn").addEventListener("click", gmailSync);
  document.getElementById("importBtn").addEventListener("click", importFromCurrentTab);
  document.getElementById("autoToggleBooking").addEventListener("change", () => toggleAutoImport());
  document.getElementById("intervalSelectBooking").addEventListener("change", () => updateInterval());
  document.getElementById("autoToggleGmail").addEventListener("change", () => toggleGmailAutoSync());
  document.getElementById("intervalSelectGmail").addEventListener("change", () => updateGmailInterval());
  document.getElementById("refreshBtn").addEventListener("click", testConnection);
  document.getElementById("connPill").addEventListener("click", testConnection);
  document.getElementById("settingsToggleBtn").addEventListener("click", toggleSettings);
  document.getElementById("saveSettingsBtn").addEventListener("click", saveSettings);

  testConnection();

  // Resume polling if a sync is still in progress
  resumeInProgressSyncs();
});

async function resumeInProgressSyncs() {
  const { lastQuickImport, lastGmailSync } = await chrome.storage.local.get({
    lastQuickImport: null,
    lastGmailSync: null,
  });

  // Booking.com: still running
  if (lastQuickImport && !lastQuickImport.done) {
    const btn = document.getElementById("quickSyncBtn");
    setSpinner(btn, "Syncing...");
    showStatus("Booking.com sync in progress...", "info");
    pollBookingSync(btn);
  }

  // Gmail: still running
  if (lastGmailSync && !lastGmailSync.done) {
    const btn = document.getElementById("gmailSyncBtn");
    setSpinner(btn, "Syncing...");
    showStatus("Gmail sync in progress...", "info");
    pollGmailSync(btn);
  }
  // Gmail: finished while popup was closed — show the result
  else if (lastGmailSync?.done && !lastGmailSync.error) {
    const r = lastGmailSync.result || lastGmailSync;
    document.getElementById("gmailLastSync").textContent = timeAgo(lastGmailSync.timestamp);
    const parts = [];
    if (r.imported > 0) parts.push(`${r.imported} new`);
    if (r.cancelled > 0) parts.push(`${r.cancelled} cancelled`);
    const msg = parts.length > 0 ? parts.join(", ") : "Up to date";
    document.getElementById("gmailLastStatus").textContent = msg;
    document.getElementById("gmailLastStatus").className = "sync-value good";
  }
}

async function pollBookingSync(btn) {
  const phases = [
    { until: 15_000, msg: "Opening Booking.com..." },
    { until: 40_000, msg: "Loading reservations..." },
    { until: 70_000, msg: "Scraping & importing..." },
    { until: 90_000, msg: "Still working..." },
  ];
  const start = Date.now();
  const deadline = start + 90_000;
  let phaseIdx = 0;

  while (Date.now() < deadline) {
    const elapsed = Date.now() - start;
    while (phaseIdx < phases.length - 1 && elapsed > phases[phaseIdx].until) phaseIdx++;
    showStatus(phases[phaseIdx].msg, "info");

    await new Promise(r => setTimeout(r, 2000));
    const { lastQuickImport } = await chrome.storage.local.get({ lastQuickImport: null });
    if (!lastQuickImport?.done) continue;

    if (lastQuickImport.error) {
      showStatus(`Sync failed: ${lastQuickImport.error}`, "error");
    } else if (lastQuickImport.message) {
      showStatus(lastQuickImport.message, "error");
    } else {
      const imported = lastQuickImport.imported || 0;
      const duplicates = lastQuickImport.duplicates || 0;
      const cancelled = lastQuickImport.cancelled || 0;
      const parts = [`${imported} new`, `${duplicates} existing`];
      if (cancelled > 0) parts.push(`${cancelled} cancelled`);
      showStatus(parts.join(" · "), imported > 0 || cancelled > 0 ? "success" : "info");
      document.getElementById("bookingLastSync").textContent = "Just now";
      document.getElementById("bookingLastCount").textContent = `${imported} new`;
    }
    resetBtn(btn, 1000);
    return;
  }
  showStatus("Timed out — check Booking.com tab", "error");
  resetBtn(btn);
}

async function pollGmailSync(btn) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    const { lastGmailSync } = await chrome.storage.local.get({ lastGmailSync: null });
    if (!lastGmailSync?.done) continue;

    if (lastGmailSync.error) {
      showStatus(`Gmail sync failed: ${lastGmailSync.error}`, "error");
      document.getElementById("gmailLastSync").textContent = "Just now";
      document.getElementById("gmailLastStatus").textContent = "Failed";
      document.getElementById("gmailLastStatus").className = "sync-value bad";
    } else {
      const r = lastGmailSync.result || lastGmailSync;
      const parts = [];
      if (r.imported > 0) parts.push(`${r.imported} new`);
      if (r.cancelled > 0) parts.push(`${r.cancelled} cancelled`);
      if (r.duplicates > 0) parts.push(`${r.duplicates} existing`);
      const msg = parts.length > 0 ? parts.join(", ") : "Up to date";
      showStatus(`Gmail: ${msg}`, "success");
      document.getElementById("gmailLastSync").textContent = "Just now";
      document.getElementById("gmailLastStatus").textContent = msg;
      document.getElementById("gmailLastStatus").className = "sync-value good";
    }
    resetBtn(btn, 1000);
    return;
  }
  showStatus("Gmail sync timed out", "error");
  resetBtn(btn);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  if (!ts) return "Never";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString();
}

function setSpinner(btn, text) {
  btn._origHtml = btn.innerHTML;
  btn.innerHTML = `<div style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.4);border-top-color:white;border-radius:50%;animation:spin .7s linear infinite"></div> ${text}`;
  btn.disabled = true;
}

function resetBtn(btn, delay = 3000) {
  setTimeout(() => {
    btn.innerHTML = btn._origHtml;
    btn.disabled = false;
  }, delay);
}

// ─── Connection ──────────────────────────────────────────────────────────────

async function testConnection() {
  const pill = document.getElementById("connPill");
  const text = document.getElementById("connText");
  pill.className = "conn-pill load";
  text.textContent = "...";

  try {
    const response = await chrome.runtime.sendMessage({ type: "TEST_CONNECTION" });
    if (response.success) {
      pill.className = "conn-pill ok";
      const n = response.result.connectedUrls || 1;
      text.textContent = `${response.result.rooms} rooms` + (n > 1 ? ` · ${n} servers` : "");
    } else {
      pill.className = "conn-pill err";
      text.textContent = "Offline";
    }
  } catch (err) {
    pill.className = "conn-pill err";
    text.textContent = "Error";
  }
}

function showStatus(msg, type) {
  const bar = document.getElementById("statusBar");
  const text = document.getElementById("statusText");
  bar.style.display = "flex";
  bar.className = `status-bar ${type === "success" ? "good" : type === "error" ? "bad" : "info"} fade-in`;
  text.textContent = msg;
}

function hideStatus() {
  document.getElementById("statusBar").style.display = "none";
}

// ─── Booking.com Auto-import ─────────────────────────────────────────────────

async function refreshAutoImportUI() {
  const response = await chrome.runtime.sendMessage({ type: "GET_AUTO_IMPORT_STATUS" });
  if (!response.success) return;

  const { booking } = response.status;
  document.getElementById("autoToggleBooking").checked = booking.enabled;
  document.getElementById("intervalSelectBooking").value = String(booking.intervalMinutes || 30);

  const nextEl = document.getElementById("bookingNextRun");
  if (booking.enabled && booking.nextFireTime) {
    nextEl.textContent = `· ${new Date(booking.nextFireTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else {
    nextEl.textContent = "";
  }

  // Last auto sync
  const stored = await chrome.storage.local.get({ lastAutoImportBooking: null });
  if (stored.lastAutoImportBooking) {
    document.getElementById("bookingLastSync").textContent = timeAgo(stored.lastAutoImportBooking.timestamp);
    document.getElementById("bookingLastCount").textContent = `${stored.lastAutoImportBooking.imported ?? 0} new`;
  }
}

async function toggleAutoImport() {
  const enabled = document.getElementById("autoToggleBooking").checked;
  const intervalMinutes = parseInt(document.getElementById("intervalSelectBooking").value);
  await chrome.runtime.sendMessage({ type: "SET_AUTO_IMPORT", source: "booking", enabled, intervalMinutes });
  await refreshAutoImportUI();
}

async function updateInterval() {
  if (!document.getElementById("autoToggleBooking").checked) return;
  await toggleAutoImport();
}

// ─── Gmail Auto-Sync ─────────────────────────────────────────────────────────

async function refreshGmailAutoSyncUI() {
  const response = await chrome.runtime.sendMessage({ type: "GET_GMAIL_AUTO_SYNC_STATUS" });
  if (!response.success) return;

  const status = response.status;
  document.getElementById("autoToggleGmail").checked = status.enabled;
  document.getElementById("intervalSelectGmail").value = String(status.intervalMinutes || 60);

  const nextEl = document.getElementById("gmailNextRun");
  if (status.enabled && status.nextFireTime) {
    nextEl.textContent = `· ${new Date(status.nextFireTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else {
    nextEl.textContent = "";
  }

  if (status.lastSync) {
    document.getElementById("gmailLastSync").textContent = timeAgo(status.lastSync.timestamp);
    if (status.lastSync.error) {
      const el = document.getElementById("gmailLastStatus");
      el.textContent = "Failed";
      el.className = "sync-value bad";
    } else {
      const el = document.getElementById("gmailLastStatus");
      el.textContent = status.lastSync.status || "OK";
      el.className = "sync-value good";
    }
  }
}

async function toggleGmailAutoSync() {
  const enabled = document.getElementById("autoToggleGmail").checked;
  const intervalMinutes = parseInt(document.getElementById("intervalSelectGmail").value);
  await chrome.runtime.sendMessage({ type: "SET_GMAIL_AUTO_SYNC", enabled, intervalMinutes });
  await refreshGmailAutoSyncUI();
}

async function updateGmailInterval() {
  if (!document.getElementById("autoToggleGmail").checked) return;
  await toggleGmailAutoSync();
}

// ─── Quick Sync Booking.com ──────────────────────────────────────────────────

async function quickSync() {
  const btn = document.getElementById("quickSyncBtn");
  setSpinner(btn, "Syncing...");
  showStatus("Starting Booking.com sync...", "info");

  try {
    const response = await chrome.runtime.sendMessage({ type: "QUICK_IMPORT", source: "booking" });
    if (!response?.success) {
      showStatus(`Sync failed: ${response?.error || "Unknown error"}`, "error");
      resetBtn(btn, 2000);
      return;
    }
    pollBookingSync(btn);
  } catch (err) {
    showStatus(`Error: ${err.message}`, "error");
    resetBtn(btn, 2000);
  }
}

// ─── Gmail Sync ──────────────────────────────────────────────────────────────

async function gmailSync() {
  const btn = document.getElementById("gmailSyncBtn");
  setSpinner(btn, "Syncing...");

  try {
    showStatus("Triggering Gmail sync...", "info");
    const response = await chrome.runtime.sendMessage({ type: "TRIGGER_GMAIL_SYNC" });

    if (!response?.success) {
      showStatus(`Gmail sync failed: ${response?.error || "Unknown error"}`, "error");
      resetBtn(btn, 2000);
      return;
    }

    // Poll for result (runs in service worker background)
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2000));
      const { lastGmailSync } = await chrome.storage.local.get({ lastGmailSync: null });
      if (!lastGmailSync?.done) {
        showStatus("Syncing Gmail emails...", "info");
        continue;
      }

      if (lastGmailSync.error) {
        showStatus(`Gmail sync failed: ${lastGmailSync.error}`, "error");
      } else {
        showStatus("Gmail sync complete", "success");
        document.getElementById("gmailLastSync").textContent = "Just now";
        document.getElementById("gmailLastStatus").textContent = "OK";
        document.getElementById("gmailLastStatus").className = "sync-value good";
      }
      resetBtn(btn, 1000);
      return;
    }

    showStatus("Gmail sync timed out", "error");
  } catch (err) {
    showStatus(`Error: ${err.message}`, "error");
  } finally {
    resetBtn(btn);
  }
}

// ─── Manual import ───────────────────────────────────────────────────────────

async function importFromCurrentTab() {
  if (!currentTab || !currentOta) return;

  const btn = document.getElementById("importBtn");
  const origHtml = btn.innerHTML;
  btn.innerHTML = `<div style="width:12px;height:12px;border:2px solid rgba(79,70,229,0.2);border-top-color:#4f46e5;border-radius:50%;animation:spin .7s linear infinite"></div> Importing...`;
  btn.disabled = true;

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: () => {
        const btn = document.getElementById("hostel-import-btn");
        if (btn) { btn.click(); return "triggered"; }
        return "no-button";
      },
    });

    if (result?.result === "no-button") {
      showStatus("Script not ready — reload page and retry", "error");
    } else {
      showStatus("Importing... check page for results", "success");
      setTimeout(async () => {
        const stored = await chrome.storage.local.get({ lastImport: null });
        if (stored.lastImport) {
          document.getElementById("bookingLastSync").textContent = timeAgo(stored.lastImport.timestamp);
          document.getElementById("bookingLastCount").textContent = `${stored.lastImport.imported} new`;
        }
      }, 3000);
    }
  } catch (err) {
    showStatus(`Error: ${err.message}`, "error");
  } finally {
    setTimeout(() => {
      btn.innerHTML = origHtml;
      btn.disabled = false;
    }, 2000);
  }
}

// ─── Settings ────────────────────────────────────────────────────────────────

function toggleSettings() {
  document.getElementById("settingsPanel").classList.toggle("open");
}

async function saveSettings() {
  const appUrl = document.getElementById("appUrl").value.replace(/\/$/, "");
  const appUrl2 = document.getElementById("appUrl2").value.replace(/\/$/, "");
  const apiKey = document.getElementById("apiKey").value;
  const hotelId = document.getElementById("hotelId").value.trim();
  await chrome.storage.local.set({ appUrl, appUrl2, apiKey, hotelId });

  const btn = document.getElementById("saveSettingsBtn");
  btn.textContent = "Saved!";
  setTimeout(() => (btn.textContent = "Save Settings"), 1500);

  testConnection();
}
