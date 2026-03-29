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
  document.getElementById("quickSyncBtn").addEventListener("click", quickSync);
  document.getElementById("importBtn").addEventListener("click", importFromCurrentTab);
  document.getElementById("autoToggleBooking").addEventListener("change", () => toggleAutoImport());
  document.getElementById("intervalSelectBooking").addEventListener("change", () => updateInterval());
  document.getElementById("refreshBtn").addEventListener("click", testConnection);
  document.getElementById("settingsToggleBtn").addEventListener("click", toggleSettings);
  document.getElementById("saveSettingsBtn").addEventListener("click", saveSettings);

  testConnection();
});

// ─── Auto-import ──────────────────────────────────────────────────────────────

async function refreshAutoImportUI() {
  const response = await chrome.runtime.sendMessage({ type: "GET_AUTO_IMPORT_STATUS" });
  if (!response.success) return;

  const { booking } = response.status;

  document.getElementById("autoToggleBooking").checked = booking.enabled;
  document.getElementById("intervalSelectBooking").value = String(booking.intervalMinutes || 30);
  const nextRunB = document.getElementById("nextRunBooking");
  if (booking.enabled && booking.nextFireTime) {
    nextRunB.textContent = `Next check: ${new Date(booking.nextFireTime).toLocaleTimeString()}`;
    nextRunB.style.display = "block";
  } else {
    nextRunB.style.display = "none";
  }

  // Last run label
  const stored = await chrome.storage.local.get({ lastAutoImportBooking: null });
  if (stored.lastAutoImportBooking) {
    const el = document.getElementById("autoLastBooking");
    const ts = new Date(stored.lastAutoImportBooking.timestamp).toLocaleString();
    el.innerHTML = `Last sync: <strong>${stored.lastAutoImportBooking.imported ?? 0} imported</strong> · ${ts}`;
    el.style.display = "block";
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

// ─── Quick Sync (background tab) ─────────────────────────────────────────────

async function quickSync() {
  const btn = document.getElementById("quickSyncBtn");
  const spinnerHtml = `
    <div style="width:13px;height:13px;border:2px solid rgba(255,255,255,0.4);border-top-color:white;border-radius:50%;animation:spin .8s linear infinite"></div>
    Syncing...
  `;
  const resetHtml = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
    Sync Booking.com
  `;

  btn.innerHTML = spinnerHtml;
  btn.disabled = true;

  try {
    showStatus("Starting sync...", "checking");

    // Kick off the import — service worker responds immediately then runs in background
    const response = await chrome.runtime.sendMessage({ type: "QUICK_IMPORT", source: "booking" });

    if (!response?.success) {
      showStatus(`Sync failed: ${response?.error || "Unknown error"}`, "disconnected");
      return;
    }

    // Poll for result — service worker opens page, waits for content, scrapes, imports
    const phases = [
      { until: 15_000, msg: "Opening Booking.com page..." },
      { until: 40_000, msg: "Waiting for reservations to load..." },
      { until: 70_000, msg: "Scraping & importing..." },
      { until: 90_000, msg: "Still working..." },
    ];

    const deadline = Date.now() + 90_000;
    let phaseIdx = 0;

    while (Date.now() < deadline) {
      // Update status message based on elapsed time
      const elapsed = Date.now() - (deadline - 90_000);
      while (phaseIdx < phases.length - 1 && elapsed > phases[phaseIdx].until) phaseIdx++;
      showStatus(phases[phaseIdx].msg, "checking");

      await new Promise(r => setTimeout(r, 2000));
      const { lastQuickImport } = await chrome.storage.local.get({ lastQuickImport: null });
      if (!lastQuickImport?.done) continue;

      if (lastQuickImport.error) {
        showStatus(`Sync failed: ${lastQuickImport.error}`, "disconnected");
        return;
      }
      if (lastQuickImport.message) {
        showStatus(lastQuickImport.message, "disconnected");
        return;
      }

      // Success — show results
      const imported = lastQuickImport.imported || 0;
      const duplicates = lastQuickImport.duplicates || 0;
      showStatus(
        `Imported ${imported} new · ${duplicates} already exist`,
        imported > 0 ? "connected" : "checking"
      );

      // Update last import section
      const { lastImport } = await chrome.storage.local.get({ lastImport: null });
      if (lastImport) {
        document.getElementById("lastImportSection").style.display = "block";
        document.getElementById("lastCount").textContent = lastImport.imported;
        document.getElementById("lastMeta").textContent =
          `${lastImport.source} · ${new Date(lastImport.timestamp).toLocaleString()}`;
      }
      return;
    }

    showStatus("Timed out — check Booking.com tab is logged in", "disconnected");
  } catch (err) {
    showStatus(`Error: ${err.message}`, "disconnected");
  } finally {
    setTimeout(() => {
      btn.innerHTML = resetHtml;
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
