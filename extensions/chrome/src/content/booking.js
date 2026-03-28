// Content script for Booking.com Extranet (admin.booking.com)
// Tailored to the actual Booking.com extranet DOM structure
(function () {
  "use strict";

  if (!window.location.href.includes("admin.booking.com")) return;

  // ─── Inject floating button ───────────────────────────────────────────────
  function injectButton() {
    if (document.getElementById("hostel-import-wrapper")) return;

    const wrapper = document.createElement("div");
    wrapper.id = "hostel-import-wrapper";
    wrapper.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
      display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
      font-family: -apple-system, sans-serif;
    `;

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
      padding: 12px 20px; background: #4f46e5; color: white;
      border: none; border-radius: 10px; font-size: 13px; font-weight: 600;
      cursor: pointer; box-shadow: 0 4px 16px rgba(79,70,229,0.4);
      transition: all 0.2s; white-space: nowrap;
    `;
    btn.addEventListener("mouseenter", () => { btn.style.background = "#4338ca"; btn.style.transform = "scale(1.02)"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "#4f46e5"; btn.style.transform = "scale(1)"; });
    btn.addEventListener("click", scrapeAndImport);

    wrapper.appendChild(btn);
    document.body.appendChild(wrapper);
  }

  // ─── Main scrape + import ─────────────────────────────────────────────────
  async function scrapeAndImport() {
    const btn = document.getElementById("hostel-import-btn");
    btn.innerHTML = `<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.4);border-top-color:white;border-radius:50%;animation:spin .8s linear infinite"></div> Scraping...`;
    btn.disabled = true;
    injectSpinnerStyle();

    try {
      const reservations = scrapeReservations();
      console.log("[Hostel Manager] Found reservations:", reservations);

      if (reservations.length === 0) {
        showNotification(
          "No reservations found on this page.\nMake sure you're on the Reservations list page.",
          "warning"
        );
        return;
      }

      showNotification(`Found ${reservations.length} reservation(s). Importing...`, "info");

      if (!chrome?.runtime?.sendMessage) {
        showNotification("Extension disconnected — please refresh this page and try again.", "error");
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: "RESERVATIONS_SCRAPED",
        data: reservations,
      });

      if (response.success) {
        showNotification(
          `Imported ${response.result.imported} new, ${response.result.duplicates} already exist`,
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

  // ─── Scraping (based on actual Booking.com extranet structure) ────────────
  //
  // The reservations table has:
  //   <tr class="bui-table__row">
  //     Contains <a href="...booking.html?res_id=XXXX...">Guest Name</a>
  //     Text includes: "Mar 27, 2026 Mar 28, 2026" (check-in, check-out)
  //     Room description: "Bed in 8-Bed FEMALE Dormitory Room..."
  //     Price: "VND 225,000"
  //     Booking number: "5901186627"
  //     Status: "OK" or "Canceled"
  //
  // Maps Booking.com room type name → hostel room ID(s)
  // R3 maps to "3A,3B" because both rooms share the same Booking.com room type.
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

  function scrapeReservations() {
    const reservations = [];
    const seen = new Set();

    // Primary: find all reservation links with res_id
    const resLinks = document.querySelectorAll('a[href*="res_id="]');
    console.log(`[Hostel Manager] Found ${resLinks.length} reservation links`);

    for (const link of resLinks) {
      try {
        // Extract res_id from URL
        const url = new URL(link.href, window.location.href);
        const resId = url.searchParams.get("res_id");
        if (!resId || seen.has(resId)) continue;

        // Guest name is the link text
        const guestName = link.textContent.trim();
        // Skip non-name links (booking numbers are also links with res_id)
        if (!guestName || /^\d+$/.test(guestName) || guestName.length < 2) continue;

        seen.add(resId);

        // Find the parent row
        const row = link.closest("tr.bui-table__row, tr");
        if (!row) continue;

        const rowText = row.textContent;

        // Skip canceled reservations
        if (/\bCanceled\b/i.test(rowText) || /\bCancelled\b/i.test(rowText)) continue;

        // Extract dates from specific columns (not full row text, to avoid using "Booked on" date)
        // Column order: Guest Name | Check-in | Check-out | Rooms | Booked on | Status | Price | Commission | Booking#
        const cells = row.querySelectorAll("td");
        let checkIn, checkOut;

        if (cells.length >= 3) {
          // Read check-in from column 1, check-out from column 2
          checkIn = extractFirstDate(cells[1].textContent);
          checkOut = extractFirstDate(cells[2].textContent);
        }

        if (!checkIn || !checkOut) {
          // Fallback: extract all dates from row, skip the earliest (booked-on date)
          const allDates = extractDates(rowText);
          if (allDates.length < 3) {
            // Only 2 dates — no booked-on date visible, use as-is
            checkIn = allDates[0];
            checkOut = allDates[1];
          } else {
            // 3 dates: [booked-on, check-in, check-out] — skip first
            checkIn = allDates[1];
            checkOut = allDates[2];
          }
        }

        if (!checkIn || !checkOut) {
          console.log(`[Hostel Manager] Skipping ${guestName}: could not parse dates`);
          continue;
        }

        // Determine room type from text
        const isFemale = /\bFEMALE\b/i.test(rowText) || /\bwomen\s*only\b/i.test(rowText);

        // Extract number of guests: "2 adults" or "1 adult"
        const guestMatch = rowText.match(/(\d+)\s+adults?/i);
        const numGuests = guestMatch ? parseInt(guestMatch[1]) : 1;

        // Extract price: "VND 225,000" or "VND 1,800,000"
        const priceMatch = rowText.match(/VND\s+([\d,]+)/);
        let totalPrice = undefined;
        if (priceMatch) {
          totalPrice = parseInt(priceMatch[1].replace(/,/g, ""));
          if (totalPrice === 0) totalPrice = undefined;
        }

        // Room type description
        const roomTypeReq = isFemale ? "female" : "mixed";
        const preferredRoom = detectPreferredRoom(rowText);

        reservations.push({
          externalId: `BC-${resId}`,
          source: "booking.com",
          guestName,
          checkIn,
          checkOut,
          numGuests,
          roomTypeReq,
          preferredRoom,
          totalPrice,
          currency: "VND",
        });
      } catch (e) {
        console.warn("[Hostel Manager] Error parsing reservation:", e);
      }
    }

    console.log(`[Hostel Manager] Successfully parsed ${reservations.length} reservations`);
    return reservations;
  }

  // ─── Extract first date from a short string (single cell) ────────────────
  function extractFirstDate(text) {
    const dates = extractDates(text.trim());
    return dates.length > 0 ? dates[0] : null;
  }

  // ─── Date extraction ──────────────────────────────────────────────────────
  // Booking.com uses "Mar 27, 2026" format
  function extractDates(text) {
    const months = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };

    const dates = [];

    // Pattern: "Mar 27, 2026" or "Mar 27 2026"
    const pattern = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})\b/gi;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const month = months[match[1].toLowerCase()];
      const day = parseInt(match[2]);
      const year = parseInt(match[3]);

      if (month !== undefined && day >= 1 && day <= 31 && year >= 2020 && year <= 2030) {
        const m = String(month + 1).padStart(2, "0");
        const d = String(day).padStart(2, "0");
        dates.push(`${year}-${m}-${d}`);
      }
    }

    // Also try "27 Mar 2026" format as fallback
    const pattern2 = /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/gi;
    while ((match = pattern2.exec(text)) !== null) {
      const day = parseInt(match[1]);
      const month = months[match[2].toLowerCase()];
      const year = parseInt(match[3]);

      if (month !== undefined && day >= 1 && day <= 31 && year >= 2020 && year <= 2030) {
        const m = String(month + 1).padStart(2, "0");
        const d = String(day).padStart(2, "0");
        const dateStr = `${year}-${m}-${d}`;
        if (!dates.includes(dateStr)) dates.push(dateStr);
      }
    }

    // Also try ISO "2026-03-27"
    const pattern3 = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((match = pattern3.exec(text)) !== null) {
      const dateStr = match[0];
      if (!dates.includes(dateStr)) dates.push(dateStr);
    }

    return dates.sort();
  }

  // ─── Notifications ────────────────────────────────────────────────────────
  function showNotification(message, type) {
    const existing = document.getElementById("hostel-notification");
    if (existing) existing.remove();

    const colors = {
      success: { bg: "#10b981", border: "#059669" },
      warning: { bg: "#f59e0b", border: "#d97706" },
      error: { bg: "#ef4444", border: "#dc2626" },
      info: { bg: "#6366f1", border: "#4f46e5" },
    };
    const { bg, border } = colors[type] || colors.info;

    const el = document.createElement("div");
    el.id = "hostel-notification";
    el.style.cssText = `
      position: fixed; top: 24px; right: 24px; z-index: 2147483647;
      padding: 14px 20px; background: ${bg}; border: 1px solid ${border};
      color: white; border-radius: 10px; font-size: 13px; font-weight: 500;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2); max-width: 400px;
      white-space: pre-line; font-family: -apple-system, sans-serif;
      animation: slideDown 0.25s ease; line-height: 1.5;
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
    if (document.getElementById("hostel-spin-style")) return;
    const style = document.createElement("style");
    style.id = "hostel-spin-style";
    style.textContent = `
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
    `;
    document.head.appendChild(style);
  }

  // ─── Auto-detect and save hotel ID ───────────────────────────────────────
  function saveHotelId() {
    const url = new URL(window.location.href);
    const hotelId = url.searchParams.get("hotel_id");
    if (hotelId) {
      chrome.storage.local.set({ hotelId });
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  injectSpinnerStyle();
  saveHotelId();
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
      setTimeout(injectButton, 1500);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
