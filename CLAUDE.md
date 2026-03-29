# Hostel SaaS — Claude Notes

## What This Project Is

A **hostel management system** built for a small hostel in Vietnam (currency: VND). It replaces manual spreadsheet tracking with a web dashboard + Chrome extension that auto-imports reservations from Booking.com.

### The Problem Being Solved

The hostel owner manages bookings from Booking.com. Previously this required manually copying reservation data into a spreadsheet to track which guest goes in which bed. This app automates that entire workflow:

1. **Chrome extension** scrapes reservations from the Booking.com extranet
2. **Web app** receives them, deduplicates, and auto-assigns guests to specific beds
3. **Bed grid** shows who is in which bed on any given night
4. Additional modules: laundry tracking, tour signups, guest management

### Stack

- **Web app**: Next.js (app router), TypeScript, SQLite via Drizzle ORM, deployed to Vercel
- **Chrome extension**: MV3, service worker + content script, no build step (plain JS)
- **Monorepo**: `apps/web/` for the web app, `extensions/chrome/` for the extension

### Pages

| Page | Purpose |
|------|---------|
| `/grid` | Visual bed assignment grid — who is in which bed per night |
| `/reservations` | Full list of all reservations, manual add/edit/cancel |
| `/settings` | Booking.com URL config, import log |
| `/laundry` | Laundry tracking per guest |
| `/tours` | Tour offerings + guest signups |

### API Routes (web app)

- `POST /api/import` — receives scraped reservations from extension, deduplicates, auto-assigns beds
- `GET /api/rooms` — room/bed list (used by extension to test connection)
- `POST /api/reservations/cancel` — cancel by externalId (called by extension)
- `GET/POST /api/assignments` — bed assignments (check-in/check-out per bed per night)
- `POST /api/auto-assign` — triggers auto-assignment for given reservation IDs

---

## Chrome Extension

### Two import sources

| Source | Method |
|--------|--------|
| **Booking.com** | Chrome extension scrapes the extranet page directly |
| **Hostelworld** | Gmail sync — reads Hostelworld booking confirmation emails from Gmail |

Both funnel into `POST /api/import` and the same deduplication + auto-assign pipeline.

### Chrome Extension — What It Does (Booking.com only)

- Injects a floating "Import to Hostel Manager" button on the Booking.com extranet
- Scrapes the reservations list page and POSTs to the web app's `/api/import`
- Supports: manual import (click button on page), Quick Sync (from popup), auto-import (alarm-based, runs in background)

### CRITICAL: Do not change the scraper approach in `extensions/chrome/src/content/booking.js`

The scraper uses **10-digit booking number links** as row anchors (e.g., `5954791060`).

**Why:** Booking.com extranet uses JavaScript navigation. Guest name links do NOT have `res_id=` in their `href` attributes — they use `onclick` handlers. The selector `a[href*="res_id="]` returns 0 results on the current Booking.com extranet.

**Working approach** (`scrapeReservations()`):
1. Scan all `<tr>` elements
2. Find the 8-12 digit booking number link in each row (last column, always plain text)
3. Find guest name: first link in the row with alphabetic text
4. Find dates: first two `<td>` cells that contain a parseable date

**Do not rewrite this to use:**
- `a[href*="res_id="]` — Booking.com JS navigation, hrefs don't have this
- `document.querySelectorAll("table tr")` with cell index guessing — fragile
- `chrome.scripting.executeScript` for Quick Sync — use `chrome.tabs.sendMessage` to the content script instead

### Quick Sync / Auto-Import flow

- Popup → service worker `QUICK_IMPORT` → `quickImportInBackground()`
- Service worker sends `SCRAPE_BOOKING_PAGE` to content script via `chrome.tabs.sendMessage`
- Content script runs `scrapeReservations()` and responds with `{ reservations }`
- Service worker POSTs to `/api/import`
- Auto-import: alarm fires → refreshes existing Booking.com tab (or opens one in background) → scrapes → imports

### Room Mappings (Booking.com room name → hostel room ID)

| Booking.com name contains | Room ID |
|--------------------------|---------|
| R3                       | 3A,3B   |
| R2                       | 2A      |
| R1                       | 1A      |
| 10-BED or WINDOW         | 5A      |
| FEMALE (no R# match)     | 4B      |

R3 maps to two rooms (3A,3B) because both share the same Booking.com room type.

### Date Format

Booking.com extranet uses `27 Mar 2026` (DD Mon YYYY) in table cells.
`extractFirstDate()` normalizes whitespace and letter/digit boundaries before parsing.

### Extension URLs / Settings

- Reservations list URL includes `&rows=100` (show all) and `date_from` = 2 days back, `date_to` = 90 days ahead
- Default app URL: `http://localhost:3000` (change in extension popup settings for production)
- Hotel ID is auto-saved from any Booking.com extranet URL's `hotel_id` param
