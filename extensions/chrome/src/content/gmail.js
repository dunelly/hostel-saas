// Gmail content script — bulk-imports Hostelworld booking/cancellation emails
(function () {
  "use strict";

  if (!window.location.href.includes("mail.google.com")) return;

  let lastInjectedUrl = null;
  let scanInProgress = false;

  // ─── SPA observer — re-check on every DOM change ─────────────────────────
  let debounce;
  new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(onPageChange, 700);
  }).observe(document.body, { childList: true, subtree: true });

  setTimeout(onPageChange, 2500);

  function onPageChange() {
    const url = window.location.href;

    // List view → show bulk scan button
    if (isListView()) {
      injectBulkButton();
      return;
    }

    // Single email view → show single import bar
    if (url !== lastInjectedUrl) {
      lastInjectedUrl = url;
      checkSingleEmail();
    }
  }

  // ─── List view detection ──────────────────────────────────────────────────
  function isListView() {
    return !document.querySelector(".a3s.aiL");
  }

  // ─── Bulk scan button for list/search view ────────────────────────────────
  function injectBulkButton() {
    const hwRows = findHostelworldRows();
    if (hwRows.length === 0) {
      document.getElementById("hostel-bulk-bar")?.remove();
      return;
    }

    if (document.getElementById("hostel-bulk-bar")) {
      // Update count
      const countEl = document.getElementById("hostel-bulk-count");
      if (countEl) countEl.textContent = `${hwRows.length} Hostelworld emails found`;
      return;
    }

    const bar = document.createElement("div");
    bar.id = "hostel-bulk-bar";
    bar.style.cssText = `
      position: sticky; top: 0; z-index: 9999;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 16px; background: #fff7ed; border-bottom: 2px solid #fed7aa;
      font-family: -apple-system, sans-serif; font-size: 13px;
    `;
    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;color:#92400e;">
        <span style="font-size:18px;">🏨</span>
        <span id="hostel-bulk-count" style="font-weight:600;">${hwRows.length} Hostelworld emails found</span>
        <span style="color:#b45309;font-size:12px;">(confirmed + cancelled)</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span id="hostel-bulk-status" style="font-size:12px;color:#b45309;"></span>
        <button id="hostel-bulk-btn" style="
          display:flex;align-items:center;gap:6px;
          padding:8px 16px;background:#ea580c;color:white;border:none;
          border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;
          box-shadow:0 2px 6px rgba(234,88,12,0.35);transition:background 0.15s;
          white-space:nowrap;
        ">↓ Import All to Hostel Manager</button>
        <button id="hostel-bulk-close" style="
          background:none;border:none;color:#92400e;cursor:pointer;font-size:16px;
          padding:4px 6px;border-radius:4px;
        ">✕</button>
      </div>
    `;

    bar.querySelector("#hostel-bulk-btn").addEventListener("click", () => startBulkScan(bar));
    bar.querySelector("#hostel-bulk-close").addEventListener("click", () => bar.remove());

    // Insert before the email list toolbar
    const toolbar = document.querySelector(".G-atb") || document.querySelector("[gh='tm']") ||
                    document.querySelector(".nH.oy8Mbf") || document.body.firstChild;
    document.body.insertBefore(bar, toolbar);
  }

  // ─── Find Hostelworld email rows in the list ──────────────────────────────
  function findHostelworldRows() {
    // Try attribute selectors first, fall back to all tr elements
    let rows = document.querySelectorAll("tr[data-thread-id], tr[data-legacy-thread-id]");
    if (rows.length === 0) {
      rows = document.querySelectorAll("tr");
    }

    const results = [];

    for (const row of rows) {
      const text = row.textContent;
      if (!/hostelworld/i.test(text)) continue;
      if (!/(confirmed|cancelled)\s*booking/i.test(text)) continue;

      const threadId =
        row.getAttribute("data-thread-id") ||
        row.getAttribute("data-legacy-thread-id") ||
        row.closest("[data-thread-id]")?.getAttribute("data-thread-id") ||
        row.closest("[data-legacy-thread-id]")?.getAttribute("data-legacy-thread-id");

      const isCancellation = /cancelled?\s*booking/i.test(text);

      // Find any link with # in the row (Gmail thread links)
      const link = row.querySelector("a[href*='#']") || row.querySelector("a[href]");
      const threadUrl = link?.href || buildThreadUrl(threadId);

      if (threadUrl) {
        results.push({ threadId, threadUrl, isCancellation, row });
      }
    }

    return results;
  }

  function buildThreadUrl(threadId) {
    if (!threadId) return null;
    const base = window.location.href.split("#")[0];
    return `${base}#all/${threadId}`;
  }

  // ─── Bulk scan: open each email in background tabs via service worker ─────
  async function startBulkScan(bar) {
    if (scanInProgress) return;
    scanInProgress = true;

    const btn = bar.querySelector("#hostel-bulk-btn");
    const status = bar.querySelector("#hostel-bulk-status");
    btn.disabled = true;
    btn.style.opacity = "0.7";

    const hwRows = findHostelworldRows();
    const urls = hwRows.map((r) => ({ url: r.threadUrl, isCancellation: r.isCancellation }));

    status.textContent = `Scanning 0 / ${urls.length}…`;

    try {
      const response = await chrome.runtime.sendMessage({
        type: "BULK_GMAIL_IMPORT",
        threads: urls,
      });

      if (response.success) {
        const r = response.result;
        btn.style.background = "#10b981";
        btn.textContent = `✓ ${r.imported} imported · ${r.cancelled} cancelled · ${r.duplicates} duplicates`;
        status.textContent = r.errors?.length ? `${r.errors.length} errors` : "";
      } else {
        btn.style.background = "#ef4444";
        btn.textContent = "Failed";
        status.textContent = response.error;
      }
    } catch (err) {
      btn.style.background = "#ef4444";
      btn.textContent = "Error";
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.style.opacity = "1";
      scanInProgress = false;
    }
  }

  // ─── Single email view ────────────────────────────────────────────────────
  function checkSingleEmail() {
    const bodyEls = document.querySelectorAll(".a3s.aiL, .a3s");
    for (const bodyEl of bodyEls) {
      const text = bodyEl.innerText || bodyEl.textContent || "";
      if (!isHostelworldEmail(text)) continue;

      const container = bodyEl.closest(".adn, .gs") ||
                        bodyEl.closest("[data-message-id]") ||
                        bodyEl.parentElement;
      if (!container) continue;

      document.getElementById("hostel-gmail-bar")?.remove();
      injectSingleBar(container, text);
      break;
    }
  }

  function isHostelworldEmail(text) {
    return /hostelworld/i.test(text) &&
           (/confirmed.*reservation|new.*booking|booking.*confirmed/i.test(text) ||
            /cancelled.*booking|booking.*cancel/i.test(text));
  }

  function injectSingleBar(container, text) {
    const isCancellation = /cancelled?\s+booking|booking.*cancel/i.test(text);
    const reservation = parseEmailText(text, isCancellation);

    const bar = document.createElement("div");
    bar.id = "hostel-gmail-bar";
    bar.style.cssText = `
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 16px; background: #fff7ed; border: 1px solid #fed7aa;
      border-radius: 8px; margin: 8px 0;
      font-family: -apple-system, sans-serif; font-size: 13px;
    `;

    if (!reservation) {
      bar.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;color:#92400e;">
          <span>📋</span>
          <span><strong>Hostelworld email detected</strong> — couldn't parse details automatically.</span>
        </div>
      `;
    } else {
      const nights = Math.round(
        (new Date(reservation.checkOut) - new Date(reservation.checkIn)) / 86400000
      );
      bar.innerHTML = `
        <div style="color:#92400e;line-height:1.5;">
          <strong>${isCancellation ? "🚫 Cancellation:" : "✅ Booking:"} ${reservation.guestName}</strong>
          <span style="color:#b45309;margin-left:8px;font-size:12px;">
            ref: ${reservation.externalId.replace("HW-","")} ·
            ${reservation.checkIn} → ${reservation.checkOut} (${nights} night${nights !== 1 ? "s" : ""}) ·
            ${reservation.numGuests} guest${reservation.numGuests !== 1 ? "s" : ""} ·
            ${reservation.preferredRoom || reservation.roomTypeReq}
            ${reservation.totalPrice ? ` · ${reservation.currency} ${reservation.totalPrice}` : ""}
          </span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
          <span id="hostel-single-status" style="font-size:11px;color:#b45309;"></span>
          <button id="hostel-single-btn" style="
            padding:7px 14px;background:${isCancellation ? "#ef4444" : "#ea580c"};color:white;
            border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;
            white-space:nowrap;
          ">${isCancellation ? "🚫 Apply Cancellation" : "↓ Import Booking"}</button>
        </div>
      `;

      bar.querySelector("#hostel-single-btn").addEventListener("click", async () => {
        const btn = bar.querySelector("#hostel-single-btn");
        const statusEl = bar.querySelector("#hostel-single-status");
        btn.disabled = true;
        btn.textContent = isCancellation ? "Cancelling…" : "Importing…";

        try {
          let response;
          if (isCancellation) {
            response = await chrome.runtime.sendMessage({
              type: "CANCEL_RESERVATIONS",
              externalIds: [reservation.externalId],
            });
          } else {
            response = await chrome.runtime.sendMessage({
              type: "RESERVATIONS_SCRAPED",
              data: [reservation],
            });
          }

          if (response.success) {
            btn.style.background = "#10b981";
            btn.textContent = isCancellation
              ? "✓ Cancelled"
              : `✓ Imported · ${response.result.duplicates > 0 ? "already existed" : "new"}`;
          } else {
            btn.style.background = "#6b7280";
            btn.textContent = "Error";
            statusEl.textContent = response.error;
          }
        } catch (err) {
          btn.style.background = "#6b7280";
          btn.textContent = "Error";
          statusEl.textContent = err.message;
        } finally {
          btn.disabled = false;
        }
      });
    }

    container.insertAdjacentElement("afterbegin", bar);
  }

  // ─── Parse Hostelworld email text (exact format from their emails) ─────────
  //
  // Format:
  //   ...booking was made on {date} by the customer (ref: 279366-576300005):
  //
  //   Anna Bösl
  //
  //   Arrival: 25th Mar 2026
  //   Nights: 1
  //   Guests: 2
  //
  //   Room Details:
  //   25th Mar 2026: 2 Beds reserved in 8 Bed Mixed Dorm Ensuite
  //
  //   Total Price: USD 18.00
  //   Deposit Paid: USD 2.70
  //
  function parseEmailText(text, isCancellation = false) {
    // Reference number — format: (ref: 279366-576300005):
    const refMatch = text.match(/\(ref:\s*(\d{5,8}-\d{7,12})\)/i);
    if (!refMatch) return null;
    const ref = refMatch[1];

    // Guest name: first non-empty line after the ref line
    const afterRef = text.slice(text.indexOf(refMatch[0]) + refMatch[0].length);
    const nameLines = afterRef.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const guestName = nameLines[0];
    if (!guestName || guestName.length < 2 || guestName.length > 80) return null;
    // Skip if the first line looks like metadata not a name
    if (/^arrival|^nights|^guests|^room|^total|^deposit|^balance/i.test(guestName)) return null;

    // Arrival date
    const arrivalMatch = text.match(/Arrival:\s*(.+)/i);
    const checkIn = parseDate(arrivalMatch?.[1]?.trim());
    if (!checkIn) return null;

    // Nights → compute checkout
    const nightsMatch = text.match(/Nights:\s*(\d+)/i);
    const nights = parseInt(nightsMatch?.[1]) || 1;
    const checkOut = addDays(checkIn, nights);

    // Guests
    const guestsMatch = text.match(/Guests:\s*(\d+)/i);
    const numGuests = parseInt(guestsMatch?.[1]) || 1;

    // Room details: "{date}: N Beds reserved in {room type}"
    const roomLineMatch = text.match(
      /\d+(?:st|nd|rd|th)?\s+\w+\s+\d{4}:\s*\d+\s+Beds?\s+reserved\s+in\s+(.+)/i
    );
    const roomText = roomLineMatch?.[1]?.trim() || "";

    // Price
    const priceMatch = text.match(/Total Price:\s*([A-Z]+)\s*([\d.,]+)/i);
    const currency = priceMatch?.[1] || "USD";
    const totalPrice = priceMatch ? parseFloat(priceMatch[2].replace(",", "")) : undefined;

    // Deposit paid
    const depositMatch = text.match(/Deposit Paid:\s*[A-Z]+\s*([\d.,]+)/i);
    const amountPaid = depositMatch ? parseFloat(depositMatch[1].replace(",", "")) : 0;

    const isFemale = /\bfemale\b|\bwomen\b/i.test(roomText);

    return {
      externalId: `HW-${ref.replace("-", "")}`,
      source: "hostelworld",
      guestName,
      checkIn,
      checkOut,
      numGuests,
      roomTypeReq: isFemale ? "female" : "mixed",
      preferredRoom: detectPreferredRoom(roomText),
      totalPrice,
      amountPaid,
      currency,
    };
  }

  // ─── Room mapping (matches Booking.com / Hostelworld room names) ───────────
  function detectPreferredRoom(text) {
    if (!text) return undefined;
    const t = text.toUpperCase();
    if (/\bR3\b/.test(t)) return "3A,3B";
    if (/\bR2\b/.test(t)) return "2A";
    if (/\bR1\b/.test(t)) return "1A";
    if (/10[.\-\s]?BED|WINDOW/.test(t)) return "5A";
    if (/8[.\-\s]?BED.*FEMALE|FEMALE.*8[.\-\s]?BED|\bFEMALE\b/.test(t)) return "4B";
    return undefined;
  }

  // ─── Date helpers ──────────────────────────────────────────────────────────
  function parseDate(d) {
    if (!d) return null;
    const s = String(d).trim().replace(/\s+/g, " ");
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const months = {
      january:1, february:2, march:3, april:4, may:5, june:6,
      july:7, august:8, september:9, october:10, november:11, december:12,
      jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
    };

    // "25th Mar 2026" or "25 March 2026"
    const m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?\s+(\d{4})/i);
    if (m) {
      const mon = months[m[2].toLowerCase()] || months[m[2].toLowerCase().slice(0, 3)];
      if (mon) return `${m[3]}-${String(mon).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }

    // "March 25, 2026"
    const m2 = s.match(/([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
    if (m2) {
      const mon = months[m2[1].toLowerCase()] || months[m2[1].toLowerCase().slice(0, 3)];
      if (mon) return `${m2[3]}-${String(mon).padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
    }

    try {
      const p = new Date(s);
      if (!isNaN(p.getTime())) return p.toISOString().split("T")[0];
    } catch (e) {}
    return null;
  }

  function addDays(dateStr, n) {
    const d = new Date(dateStr + "T12:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
  }
})();
