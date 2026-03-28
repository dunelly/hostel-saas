let currentTab = null;
let currentOta = null;

document.addEventListener("DOMContentLoaded", async () => {
  // Load settings
  const stored = await chrome.storage.local.get({
    appUrl: "http://localhost:3000",
    apiKey: "hostel-dev-key-change-me",
    hotelId: "",
    lastImport: null,
  });

  document.getElementById("appUrl").value = stored.appUrl;
  document.getElementById("apiKey").value = stored.apiKey;
  document.getElementById("hotelId").value = stored.hotelId || "";

  // Show last manual import
  if (stored.lastImport) {
    document.getElementById("lastImportSection").style.display = "block";
    document.getElementById("lastCount").textContent = stored.lastImport.imported;
    document.getElementById("lastMeta").textContent =
      `${stored.lastImport.source} · ${new Date(stored.lastImport.timestamp).toLocaleString()}`;
  }

  // Detect current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  const badge = document.getElementById("otaBadge");
  const otaText = document.getElementById("otaText");
  const importBtn = document.getElementById("importBtn");

  if (tab?.url?.includes("admin.booking.com")) {
    currentOta = "booking";
    badge.className = "ota-badge booking";
    otaText.textContent = "Booking.com detected";
    importBtn.disabled = false;
  } else if (tab?.url?.includes("hostelworld.com")) {
    currentOta = "hostelworld";
    badge.className = "ota-badge hostelworld";
    otaText.textContent = "Hostelworld detected";
    importBtn.disabled = false;
  } else {
    badge.className = "ota-badge none";
    otaText.textContent = "Open Booking.com or Hostelworld extranet";
    importBtn.disabled = true;
  }

  // Load auto-import status (non-fatal — don't let this block listener registration)
  refreshAutoImportUI().catch(() => {});

  // Wire up event listeners (inline onclick blocked by MV3 CSP)
  document.getElementById("gmailSyncBtn").addEventListener("click", gmailSync);
  document.getElementById("quickSyncBtn").addEventListener("click", quickSync);
  document.getElementById("importBtn").addEventListener("click", importFromCurrentTab);
  document.getElementById("autoToggleBooking").addEventListener("change", () => toggleAutoImport("booking"));
  document.getElementById("intervalSelectBooking").addEventListener("change", () => updateInterval("booking"));
  document.getElementById("autoToggleGmail").addEventListener("change", () => toggleAutoImport("gmail"));
  document.getElementById("intervalSelectGmail").addEventListener("change", () => updateInterval("gmail"));
  document.getElementById("refreshBtn").addEventListener("click", testConnection);
  document.getElementById("settingsToggleBtn").addEventListener("click", toggleSettings);
  document.getElementById("saveSettingsBtn").addEventListener("click", saveSettings);

  testConnection();
});

// ─── Auto-import ──────────────────────────────────────────────────────────────

async function refreshAutoImportUI() {
  const response = await chrome.runtime.sendMessage({ type: "GET_AUTO_IMPORT_STATUS" });
  if (!response.success) return;

  const { booking, gmail } = response.status;

  // Booking
  document.getElementById("autoToggleBooking").checked = booking.enabled;
  document.getElementById("intervalSelectBooking").value = String(booking.intervalMinutes || 30);
  const nextRunB = document.getElementById("nextRunBooking");
  if (booking.enabled && booking.nextFireTime) {
    nextRunB.textContent = `Next check: ${new Date(booking.nextFireTime).toLocaleTimeString()}`;
    nextRunB.style.display = "block";
  } else {
    nextRunB.style.display = "none";
  }

  // Gmail
  document.getElementById("autoToggleGmail").checked = gmail.enabled;
  document.getElementById("intervalSelectGmail").value = String(gmail.intervalMinutes || 30);
  const nextRunG = document.getElementById("nextRunGmail");
  if (gmail.enabled && gmail.nextFireTime) {
    nextRunG.textContent = `Next check: ${new Date(gmail.nextFireTime).toLocaleTimeString()}`;
    nextRunG.style.display = "block";
  } else {
    nextRunG.style.display = "none";
  }

  // Last run labels
  const stored = await chrome.storage.local.get({ lastAutoImportBooking: null, lastAutoImportGmail: null });
  if (stored.lastAutoImportBooking) {
    const el = document.getElementById("autoLastBooking");
    const ts = new Date(stored.lastAutoImportBooking.timestamp).toLocaleString();
    el.innerHTML = `Last sync: <strong>${stored.lastAutoImportBooking.imported ?? 0} imported</strong> · ${ts}`;
    el.style.display = "block";
  }
  if (stored.lastAutoImportGmail) {
    const el = document.getElementById("autoLastGmail");
    const ts = new Date(stored.lastAutoImportGmail.timestamp).toLocaleString();
    el.innerHTML = `Last sync: <strong>${stored.lastAutoImportGmail.imported ?? 0} imported</strong> · ${ts}`;
    el.style.display = "block";
  }
}

async function toggleAutoImport(source) {
  const toggleId = source === "gmail" ? "autoToggleGmail" : "autoToggleBooking";
  const intervalId = source === "gmail" ? "intervalSelectGmail" : "intervalSelectBooking";
  const enabled = document.getElementById(toggleId).checked;
  const intervalMinutes = parseInt(document.getElementById(intervalId).value);

  await chrome.runtime.sendMessage({ type: "SET_AUTO_IMPORT", source, enabled, intervalMinutes });
  await refreshAutoImportUI();
}

async function updateInterval(source) {
  const toggleId = source === "gmail" ? "autoToggleGmail" : "autoToggleBooking";
  if (!document.getElementById(toggleId).checked) return;
  await toggleAutoImport(source);
}

// ─── Gmail API sync (Hostelworld) ─────────────────────────────────────────────

async function gmailSync() {
  const btn = document.getElementById("gmailSyncBtn");
  btn.innerHTML = `
    <div style="width:13px;height:13px;border:2px solid rgba(255,255,255,0.4);border-top-color:white;border-radius:50%;animation:spin .8s linear infinite"></div>
    Checking Gmail...
  `;
  btn.disabled = true;

  try {
    showStatus("Connecting to Google...", "checking");

    // Get OAuth token here — popup has window context, service worker can't show auth dialogs
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (t) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(t);
      });
    });

    showStatus("Scanning Gmail for Hostelworld emails...", "checking");
    const response = await chrome.runtime.sendMessage({ type: "GMAIL_API_IMPORT", token });

    if (response.success) {
      const { imported, duplicates, cancelled, newFound } = response.result;
      const msg = newFound === 0
        ? "Gmail: no new Hostelworld emails"
        : `Gmail: ${imported} imported · ${duplicates} duplicates · ${cancelled} cancelled`;
      showStatus(msg, imported > 0 || cancelled > 0 ? "connected" : "checking");

      const stored = await chrome.storage.local.get({ lastImport: null });
      if (stored.lastImport) {
        document.getElementById("lastImportSection").style.display = "block";
        document.getElementById("lastCount").textContent = stored.lastImport.imported;
        document.getElementById("lastMeta").textContent =
          `${stored.lastImport.source} · ${new Date(stored.lastImport.timestamp).toLocaleString()}`;
      }
    } else {
      showStatus(`Gmail sync failed: ${response.error}`, "disconnected");
    }
  } catch (err) {
    showStatus(`Error: ${err.message}`, "disconnected");
  } finally {
    setTimeout(() => {
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
        Sync Gmail (Hostelworld)
      `;
      btn.disabled = false;
    }, 3000);
  }
}

// ─── Quick Sync (background tab) ─────────────────────────────────────────────

async function quickSync() {
  const btn = document.getElementById("quickSyncBtn");
  btn.innerHTML = `
    <div style="width:13px;height:13px;border:2px solid rgba(255,255,255,0.4);border-top-color:white;border-radius:50%;animation:spin .8s linear infinite"></div>
    Syncing...
  `;
  btn.disabled = true;

  try {
    showStatus("Scanning open Booking.com tab...", "checking");

    const response = await chrome.runtime.sendMessage({
      type: "QUICK_IMPORT",
      source: "booking",
    });

    if (response.success) {
      const { imported, duplicates, message } = response.result;
      showStatus(
        message || `Imported ${imported} new · ${duplicates} already exist`,
        imported > 0 ? "connected" : "checking"
      );

      // Refresh last import display
      const stored2 = await chrome.storage.local.get({ lastImport: null });
      if (stored2.lastImport) {
        document.getElementById("lastImportSection").style.display = "block";
        document.getElementById("lastCount").textContent = stored2.lastImport.imported;
        document.getElementById("lastMeta").textContent =
          `${stored2.lastImport.source} · ${new Date(stored2.lastImport.timestamp).toLocaleString()}`;
      }
    } else {
      showStatus(`Sync failed: ${response.error}`, "disconnected");
    }
  } catch (err) {
    showStatus(`Error: ${err.message}`, "disconnected");
  } finally {
    setTimeout(() => {
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
        Quick Sync (Background)
      `;
      btn.disabled = false;
    }, 3000);
  }
}

// ─── Manual import ────────────────────────────────────────────────────────────

async function importFromCurrentTab() {
  if (!currentTab || !currentOta) return;

  const importBtn = document.getElementById("importBtn");
  importBtn.innerHTML = `
    <div style="width:13px;height:13px;border:2px solid rgba(255,255,255,0.4);border-top-color:white;border-radius:50%;animation:spin .8s linear infinite"></div>
    Importing...
  `;
  importBtn.disabled = true;

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
      showStatus("Script not ready — reload the OTA page and try again.", "warning");
    } else {
      showStatus("Importing... check the page for results.", "success");
      // Refresh last import after a delay
      setTimeout(async () => {
        const stored = await chrome.storage.local.get({ lastImport: null });
        if (stored.lastImport) {
          document.getElementById("lastImportSection").style.display = "block";
          document.getElementById("lastCount").textContent = stored.lastImport.imported;
          document.getElementById("lastMeta").textContent =
            `${stored.lastImport.source} · ${new Date(stored.lastImport.timestamp).toLocaleString()}`;
        }
      }, 3000);
    }
  } catch (err) {
    showStatus(`Error: ${err.message}`, "error");
  } finally {
    setTimeout(() => {
      importBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/>
        </svg>
        Import from Current Page
      `;
      importBtn.disabled = false;
    }, 2000);
  }
}

// ─── Connection ───────────────────────────────────────────────────────────────

async function testConnection() {
  const statusEl = document.getElementById("connectionStatus");
  statusEl.className = "status checking";
  statusEl.querySelector("span").textContent = "Checking connection...";

  try {
    const response = await chrome.runtime.sendMessage({ type: "TEST_CONNECTION" });

    if (response.success) {
      statusEl.className = "status connected";
      statusEl.querySelector("span").textContent = `Connected · ${response.result.rooms} rooms`;
    } else {
      statusEl.className = "status disconnected";
      statusEl.querySelector("span").textContent = `Not connected: ${response.error}`;
    }
  } catch (err) {
    statusEl.className = "status disconnected";
    statusEl.querySelector("span").textContent = `Error: ${err.message}`;
  }
}

function showStatus(msg, type) {
  const el = document.getElementById("connectionStatus");
  const cls = type === "success" ? "connected" : type === "warning" ? "checking" : "disconnected";
  el.className = `status ${cls}`;
  el.querySelector("span").textContent = msg;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function toggleSettings() {
  document.getElementById("settingsPanel").classList.toggle("open");
}

async function saveSettings() {
  const appUrl = document.getElementById("appUrl").value.replace(/\/$/, "");
  const apiKey = document.getElementById("apiKey").value;
  const hotelId = document.getElementById("hotelId").value.trim();
  await chrome.storage.local.set({ appUrl, apiKey, hotelId });

  const btn = document.getElementById("saveSettingsBtn");
  btn.textContent = "Saved!";
  setTimeout(() => (btn.textContent = "Save Settings"), 1500);

  testConnection();
}
