// Content script for Hostelworld Extranet (inbox.hostelworld.com)
(function () {
  "use strict";

  if (!window.location.href.includes("hostelworld.com")) return;

  const ARRIVALS_URL = "https://inbox.hostelworld.com/booking/arrivals";
  const isArrivalsPage = /\/booking\/(arrivals|departures|bookings)/.test(window.location.pathname);
  const isLoginPage = /\/(loggedin|login|$)/.test(window.location.pathname);

  // ─── On login success — show prompt to go to arrivals ─────────────────────
  if (isLoginPage) {
    setTimeout(showGoToArrivalsPrompt, 1000);
    return;
  }

  // ─── Inject button ─────────────────────────────────────────────────────────
  function injectButton() {
    if (document.getElementById("hostel-import-btn")) return;

    const btn = document.createElement("button");
    btn.id = "hostel-import-btn";
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0">
        <polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/>
      </svg>
      Import to Hostel Manager
    `;
    btn.style.cssText = `
      display: flex; align-items: center; gap: 8px;
      position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
      padding: 12px 22px; background: #ea580c; color: white;
      border: none; border-radius: 10px; font-size: 13px; font-weight: 600;
      cursor: pointer; box-shadow: 0 4px 16px rgba(234,88,12,0.4);
      transition: all 0.2s; white-space: nowrap; font-family: -apple-system, sans-serif;
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "#c2410c";
      btn.style.transform = "scale(1.02)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "#ea580c";
      btn.style.transform = "scale(1)";
    });
    btn.addEventListener("click", scrapeAndImport);
    document.body.appendChild(btn);

    // If not on a bookings page, show a hint
    if (!isArrivalsPage) {
      showArrivalsHint();
    }
  }

  // ─── Main flow ─────────────────────────────────────────────────────────────
  async function scrapeAndImport() {
    const btn = document.getElementById("hostel-import-btn");
    btn.innerHTML = `<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.4);border-top-color:white;border-radius:50%;animation:hwspin .8s linear infinite"></div> Scraping…`;
    btn.disabled = true;
    injectSpinnerStyle();

    try {
      const reservations = scrapeReservations();
      console.log("[Hostel Manager] Hostelworld found:", reservations);

      if (reservations.length === 0) {
        showNotification(
          "No reservations found.\n\nMake sure you're on:\nBookings → Arrivals (or Bookings tab)",
          "warning"
        );
        return;
      }

      showNotification(`Found ${reservations.length} reservation(s). Importing…`, "info");

      const response = await chrome.runtime.sendMessage({
        type: "RESERVATIONS_SCRAPED",
        data: reservations,
      });

      if (response.success) {
        showNotification(
          `✓ Imported ${response.result.imported} new · ${response.result.duplicates} already exist`,
          "success"
        );
      } else {
        showNotification(`Import failed: ${response.error}`, "error");
      }
    } catch (err) {
      showNotification(`Error: ${err.message}`, "error");
    } finally {
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0">
          <polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/>
        </svg>
        Import to Hostel Manager
      `;
      btn.disabled = false;
    }
  }

  // ─── Scrape: targets the actual Hostelworld arrivals table ─────────────────
  //
  // Table columns: Reference | Name | Arriving | Nights | Beds | Status | [View btn]
  // Example row:   279366-575827634 | Darnell Massie | 27 Mar 2026 | 2 | 1 | OK
  //
  function scrapeReservations() {
    const results = [];

    // Find all table rows that have a reference number in the format XXXXXX-XXXXXXXXX
    const rows = document.querySelectorAll("table tr, tbody tr");

    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length < 4) continue;

      const refText = cells[0]?.textContent?.trim();
      const nameText = cells[1]?.textContent?.trim();
      const arrivingText = cells[2]?.textContent?.trim();
      const nightsText = cells[3]?.textContent?.trim();
      const bedsText = cells[4]?.textContent?.trim();

      // Reference must match XXXXXX-XXXXXXXXX pattern
      if (!refText || !/^\d{5,8}-\d{7,12}$/.test(refText)) continue;
      if (!nameText || nameText.length < 2) continue;

      const checkIn = parseDate(arrivingText);
      if (!checkIn) continue;

      const nights = parseInt(nightsText) || 1;
      const checkOut = addDays(checkIn, nights);

      const beds = parseInt(bedsText) || 1;

      // Skip cancelled rows (Status column or row text)
      const rowText = row.textContent;
      if (/\bcancelled?\b/i.test(rowText)) continue;

      // Detect female room from row text (e.g. "Female Dorm" in a linked view)
      const isFemale = /\bfemale\b|\bwomen\b/i.test(rowText);

      results.push({
        externalId: `HW-${refText.replace("-", "")}`,
        source: "hostelworld",
        guestName: nameText,
        checkIn,
        checkOut,
        numGuests: beds,
        roomTypeReq: isFemale ? "female" : "mixed",
        preferredRoom: detectPreferredRoom(rowText),
      });
    }

    // Fallback: if no table rows matched, try the "View" button links
    if (results.length === 0) {
      return scrapeFromViewLinks();
    }

    return deduplicate(results);
  }

  // ─── Fallback: scrape from "View" button links ─────────────────────────────
  // Each row has a "View" button linking to /booking/view/{bookingId}
  // We can extract the booking ID from the link and pair with the row data
  function scrapeFromViewLinks() {
    const results = [];

    const viewLinks = document.querySelectorAll('a[href*="/booking/view"], a[href*="/bookings/"]');

    for (const link of viewLinks) {
      try {
        const url = new URL(link.href, window.location.href);
        const bookingId =
          url.pathname.match(/\/booking\/view\/(\d+)/)?.[1] ||
          url.pathname.match(/\/bookings?\/(\d+)/)?.[1];

        if (!bookingId) continue;

        // Walk up to find the containing row
        const row = link.closest("tr");
        if (!row) continue;

        const cells = row.querySelectorAll("td");
        if (cells.length < 3) continue;

        const nameText = cells[1]?.textContent?.trim() || cells[0]?.textContent?.trim();
        const arrivingText = cells[2]?.textContent?.trim();
        const nightsText = cells[3]?.textContent?.trim();
        const bedsText = cells[4]?.textContent?.trim();

        if (!nameText || nameText.length < 2) continue;
        const checkIn = parseDate(arrivingText);
        if (!checkIn) continue;

        const nights = parseInt(nightsText) || 1;
        const checkOut = addDays(checkIn, nights);
        const beds = parseInt(bedsText) || 1;

        results.push({
          externalId: `HW-${bookingId}`,
          source: "hostelworld",
          guestName: nameText,
          checkIn,
          checkOut,
          numGuests: beds,
          roomTypeReq: "mixed",
          preferredRoom: detectPreferredRoom(row.textContent),
        });
      } catch (e) {}
    }

    return deduplicate(results);
  }

  // ─── Room mapping (same names used on both Booking.com and Hostelworld) ────
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

  // ─── Helpers ───────────────────────────────────────────────────────────────

  // Parse "27 Mar 2026" → "2026-03-27"
  function parseDate(d) {
    if (!d) return null;
    const s = String(d).trim();

    // ISO YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // "27 Mar 2026" / "27 March 2026"
    const months = {
      jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
      jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
    };
    const m = s.match(/(\d{1,2})\s+([a-z]{3,9})\.?\s+(\d{4})/i);
    if (m) {
      const mon = months[m[2].toLowerCase().slice(0, 3)];
      if (mon) {
        return `${m[3]}-${String(mon).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      }
    }

    // DD/MM/YYYY
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    }

    // Generic fallback
    try {
      const parsed = new Date(s);
      if (!isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
    } catch (e) {}
    return null;
  }

  function addDays(dateStr, n) {
    const d = new Date(dateStr + "T12:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
  }

  function deduplicate(arr) {
    const seen = new Set();
    return arr.filter((r) => {
      if (seen.has(r.externalId)) return false;
      seen.add(r.externalId);
      return true;
    });
  }

  // ─── UI helpers ────────────────────────────────────────────────────────────

  function showArrivalsHint() {
    const hint = document.createElement("div");
    hint.id = "hostel-arrivals-hint";
    hint.style.cssText = `
      position: fixed; bottom: 70px; right: 24px; z-index: 2147483647;
      background: #1e293b; color: #94a3b8; border-radius: 8px;
      padding: 8px 14px; font-size: 11px; font-family: -apple-system, sans-serif;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3); max-width: 260px; line-height: 1.5;
    `;
    hint.innerHTML = `
      For best results, go to
      <a href="${ARRIVALS_URL}" style="color:#fb923c;font-weight:600;text-decoration:none;">
        Bookings → Arrivals
      </a>
      first.
    `;
    document.body.appendChild(hint);
    setTimeout(() => {
      hint.style.transition = "opacity 0.3s";
      hint.style.opacity = "0";
      setTimeout(() => hint.remove(), 350);
    }, 7000);
  }

  function showGoToArrivalsPrompt() {
    if (document.getElementById("hostel-go-arrivals")) return;

    const el = document.createElement("div");
    el.id = "hostel-go-arrivals";
    el.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 2147483647;
      background: #1e293b; color: white; border-radius: 12px;
      padding: 16px 20px; font-size: 13px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35); max-width: 260px;
      font-family: -apple-system, sans-serif; line-height: 1.5;
      display: flex; flex-direction: column; gap: 10px;
    `;
    el.innerHTML = `
      <div style="font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px;">
        <span>🏨</span> Hostel Manager
      </div>
      <div style="color:#94a3b8;font-size:12px;">
        Logged in! Go to Arrivals to import today's check-ins.
      </div>
      <a href="${ARRIVALS_URL}" style="
        display:flex;align-items:center;justify-content:center;
        background:#ea580c;color:white;border-radius:8px;
        padding:9px 14px;text-decoration:none;font-weight:600;font-size:12px;
      ">View Arrivals →</a>
      <button onclick="this.parentElement.remove()" style="
        background:none;border:none;color:#475569;font-size:11px;cursor:pointer;
      ">Dismiss</button>
    `;
    document.body.appendChild(el);

    setTimeout(() => {
      el.style.transition = "opacity 0.4s";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 400);
    }, 10000);
  }

  function showNotification(message, type) {
    const existing = document.getElementById("hostel-notification");
    if (existing) existing.remove();

    const colors = {
      success: { bg: "#10b981", border: "#059669" },
      warning: { bg: "#f59e0b", border: "#d97706" },
      error: { bg: "#ef4444", border: "#dc2626" },
      info: { bg: "#ea580c", border: "#c2410c" },
    };
    const { bg, border } = colors[type] || colors.info;

    const el = document.createElement("div");
    el.id = "hostel-notification";
    el.style.cssText = `
      position: fixed; top: 24px; right: 24px; z-index: 2147483647;
      padding: 14px 20px; background: ${bg}; border: 1px solid ${border};
      color: white; border-radius: 10px; font-size: 13px; font-weight: 500;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2); max-width: 360px;
      white-space: pre-line; font-family: -apple-system, sans-serif;
    `;
    el.textContent = message;
    document.body.appendChild(el);

    setTimeout(() => {
      el.style.transition = "opacity 0.3s";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 350);
    }, 6000);
  }

  function injectSpinnerStyle() {
    if (document.getElementById("hostel-hw-style")) return;
    const style = document.createElement("style");
    style.id = "hostel-hw-style";
    style.textContent = `@keyframes hwspin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }

  // ─── Init ──────────────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectButton);
  } else {
    injectButton();
  }

  // Re-inject on SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(injectButton, 1200);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
