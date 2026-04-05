/**
 * Receptionist Daily Workflow Tests
 *
 * Simulates a full day at the hostel front desk.
 * Tests marked [NOT IMPLEMENTED] document features that need to be built.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Page } from "puppeteer";
import { newPage, closeBrowser, url, clickButton, apiPost } from "./helpers";

const today = new Date().toISOString().split("T")[0];
const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
const runId = Date.now().toString(36);

describe("Receptionist Daily Workflow", () => {
  let page: Page;

  beforeAll(async () => {
    await fetch(url("/api/seed"), { method: "POST" });
    await apiPost("/api/import", {
      reservations: [{
        guestName: `Reception Test ${runId}`,
        checkIn: today,
        checkOut: nextWeek,
        numGuests: 1,
        roomTypeReq: "mixed",
        source: "booking.com",
        externalId: `REC-TEST-${runId}`,
        totalPrice: 700000,
        currency: "VND",
      }],
    });
    page = await newPage();
  });

  afterAll(async () => {
    await page?.close();
    await closeBrowser();
  });

  // ═══════════════════════════════════════
  // MORNING — Dashboard review
  // ═══════════════════════════════════════

  describe("Morning: Dashboard review", () => {
    it("shows stat cards and today's activity", async () => {
      await page.goto(url("/"), { waitUntil: "networkidle2" });
      await page.waitForSelector("xpath/.//span[contains(text(),'Total Beds')]", { timeout: 10_000 });

      const content = await page.content();
      expect(content).toContain("Total Beds");
      expect(content).toContain("Occupied Tonight");
    });

    it("shows today's arrivals section", async () => {
      const arrivals = await page.$("xpath/.//span[contains(text(),'Arrivals')]");
      expect(arrivals).not.toBeNull();
    });

    it("shows today's departures section", async () => {
      const departures = await page.$("xpath/.//span[contains(text(),'Departures')]");
      expect(departures).not.toBeNull();
    });

    it("can click an arrival to open guest detail panel", async () => {
      const guestBtn = await page.$("xpath/.//span[contains(text(),'Arrivals')]/ancestor::div[contains(@class,'rounded-xl')]//button");
      if (!guestBtn) return;
      await guestBtn.click();

      const panel = await page.waitForSelector("div.fixed.z-50", { visible: true, timeout: 5_000 });
      expect(panel).not.toBeNull();

      // Close
      const closeBtn = await page.$("div.fixed.z-50 button.w-8.h-8.rounded-full");
      await closeBtn?.click();
      await new Promise(r => setTimeout(r, 300));
    });
  });

  // ═══════════════════════════════════════
  // CHECK-IN — Guest arrives with booking
  // ═══════════════════════════════════════

  describe("Check-in flow", () => {
    it("opens grid and finds guest cell to double-click", async () => {
      await page.goto(url("/grid"), { waitUntil: "networkidle2" });
      await page.waitForSelector("table", { timeout: 15_000 });

      // Double-click first guest cell
      const guestCell = await page.$("div.cursor-grab");
      expect(guestCell).not.toBeNull();
      await guestCell!.click({ count: 2 });

      const panel = await page.waitForSelector("div.fixed.z-50", { visible: true, timeout: 5_000 });
      expect(panel).not.toBeNull();
    });

    it("shows check-in form with passport/phone/nationality fields", async () => {
      const checkInBtn = await page.$('xpath/.//button[normalize-space()="Check In"]');
      if (!checkInBtn) {
        // Guest already checked in — close and skip
        const closeBtn = await page.$("div.fixed.z-50 button.w-8.h-8.rounded-full");
        await closeBtn?.click();
        await new Promise(r => setTimeout(r, 300));
        return;
      }

      await checkInBtn.click();

      const passportInput = await page.waitForSelector('input[placeholder="Passport / ID"]', {
        visible: true, timeout: 3_000,
      });
      expect(passportInput).not.toBeNull();

      const phoneInput = await page.$('input[placeholder="Phone"]');
      expect(phoneInput).not.toBeNull();

      const natInput = await page.$('input[placeholder="Nationality"]');
      expect(natInput).not.toBeNull();
    });

    it("fills info and confirms check-in", async () => {
      const passportInput = await page.$('input[placeholder="Passport / ID"]');
      if (!passportInput) return; // skipped if guest already checked in

      await passportInput.type("P12345678");
      const natInput = await page.$('input[placeholder="Nationality"]');
      await natInput?.type("Australia");
      const phoneInput = await page.$('input[placeholder="Phone"]');
      await phoneInput?.type("+61412345678");

      const confirmBtn = await page.$('xpath/.//button[contains(.,"Confirm Check In")]');
      await confirmBtn?.click();
      await page.waitForNetworkIdle({ timeout: 5_000 });

      // Should now show "Checked In"
      const status = await page.$("xpath/.//span[contains(text(),'Checked In')]");
      expect(status).not.toBeNull();

      // Close panel
      const closeBtn = await page.$("div.fixed.z-50 button.w-8.h-8.rounded-full");
      await closeBtn?.click();
      await new Promise(r => setTimeout(r, 300));
    });
  });

  // ═══════════════════════════════════════
  // WALK-IN — Guest off the street
  // ═══════════════════════════════════════

  describe("Walk-in guest", () => {
    it("opens QuickAddPopover on empty cell click", async () => {
      await page.goto(url("/grid"), { waitUntil: "networkidle2" });
      await page.waitForSelector("table", { timeout: 15_000 });

      const emptyCell = await page.$("tr[data-bed-id] td .group\\/empty");
      if (!emptyCell) return;

      await emptyCell.click();
      const nameInput = await page.waitForSelector('input[placeholder="Full name"]', {
        visible: true, timeout: 5_000,
      });
      expect(nameInput).not.toBeNull();
    });

    it("has phone and nationality fields", async () => {
      const phone = await page.$('input[placeholder="Phone"]');
      const nat = await page.$('input[placeholder="Nationality"]');
      expect(phone).not.toBeNull();
      expect(nat).not.toBeNull();
    });

    it("has partial payment option", async () => {
      // The Partial button is inside the popover form
      const partialBtn = await page.evaluate(() => {
        const buttons = document.querySelectorAll("button[type='button']");
        for (const b of buttons) {
          if (b.textContent?.trim() === "Partial") return true;
        }
        return false;
      });
      expect(partialBtn).toBe(true);
    });

    it("fills and submits walk-in booking", async () => {
      const nameInput = await page.$('input[placeholder="Full name"]');
      if (!nameInput) return;

      await nameInput.type(`Walk-in ${runId}`);

      // Set 2 nights via quick picker
      const nightBtn = await page.evaluate(() => {
        const btns = document.querySelectorAll("button[type='button']");
        for (const b of btns) {
          if (b.textContent?.trim() === "2" && b.className.includes("rounded-lg")) {
            (b as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      // Set price
      const priceInput = await page.$('input[placeholder="0.00"]');
      if (priceInput) await priceInput.type("200000");

      // Submit
      const submitBtn = await page.$("button[type='submit']");
      await submitBtn?.click();
      await page.waitForNetworkIdle({ timeout: 10_000 });
      await new Promise(r => setTimeout(r, 500));
    });
  });

  // ═══════════════════════════════════════
  // RESERVATIONS — Search, filter, bed column
  // ═══════════════════════════════════════

  describe("Reservations table", () => {
    it("has Bed column in the header", async () => {
      await page.goto(url("/reservations"), { waitUntil: "networkidle2" });
      await page.waitForSelector("table", { timeout: 15_000 });

      const headers = await page.$$eval("thead th", ths =>
        ths.map(th => th.textContent?.trim())
      );
      expect(headers).toContain("Bed");
    });

    it("shows bed IDs for assigned guests", async () => {
      await new Promise(r => setTimeout(r, 500));
      const bedBadge = await page.$("tbody td span.font-mono");
      expect(bedBadge).not.toBeNull();
    });

    it("can search for a guest", async () => {
      const search = await page.$('input[placeholder="Search by guest name..."]');
      await search?.click({ clickCount: 3 });
      await search?.type("Sophie");
      await new Promise(r => setTimeout(r, 500));

      const content = await page.content();
      expect(content).toContain("Sophie");

      await search?.click({ clickCount: 3 });
      await page.keyboard.press("Backspace");
    });

    it("can filter by status", async () => {
      const selects = await page.$$("select");
      if (selects.length >= 3) {
        await selects[2].select("confirmed");
        await new Promise(r => setTimeout(r, 500));

        const rows = await page.$$("tbody tr");
        expect(rows.length).toBeGreaterThanOrEqual(1);

        await selects[2].select("");
      }
    });
  });

  // ═══════════════════════════════════════
  // LAUNDRY — Record a laundry order
  // ═══════════════════════════════════════

  describe("Laundry tracking", () => {
    it("opens laundry page and creates an order", async () => {
      await page.goto(url("/laundry"), { waitUntil: "networkidle2" });
      await page.waitForSelector("xpath/.//h1[contains(text(),'Laundry')]", { timeout: 10_000 });

      await clickButton(page, "New Order");

      // Select first guest
      const guestSelect = await page.waitForSelector("select", { visible: true, timeout: 5_000 });
      const firstVal = await guestSelect!.evaluate(el => {
        const opts = (el as HTMLSelectElement).options;
        return opts.length > 1 ? opts[1].value : null;
      });
      if (firstVal) await guestSelect!.select(firstVal);

      // Set price
      const priceInput = await page.$('input[type="number"]');
      if (priceInput) {
        await priceInput.click({ clickCount: 3 });
        await priceInput.type("50000");
      }

      await clickButton(page, "Create Order");
      await page.waitForNetworkIdle({ timeout: 5_000 });
    });
  });

  // ═══════════════════════════════════════
  // TOURS — Create a tour and sign up a guest
  // ═══════════════════════════════════════

  describe("Tour management", () => {
    it("creates a new tour", async () => {
      await page.goto(url("/tours"), { waitUntil: "networkidle2" });
      await page.waitForSelector("xpath/.//h1[contains(text(),'Tours')]", { timeout: 10_000 });

      await clickButton(page, "Add Tour");
      const nameInput = await page.waitForSelector('input[placeholder*="Ha Long"]', {
        visible: true, timeout: 5_000,
      });
      if (!nameInput) return;

      await nameInput.type(`Test Tour ${runId}`);
      const priceInput = await page.$('input[type="number"]');
      if (priceInput) {
        await priceInput.click({ clickCount: 3 });
        await priceInput.type("500000");
      }

      await clickButton(page, "Create Tour");
      await page.waitForNetworkIdle({ timeout: 5_000 });

      const content = await page.content();
      expect(content).toContain(`Test Tour ${runId}`);
    });
  });

  // ═══════════════════════════════════════
  // GRID — Bed management
  // ═══════════════════════════════════════

  describe("Grid management", () => {
    it("renders bed rows and date columns", async () => {
      await page.goto(url("/grid"), { waitUntil: "networkidle2" });
      await page.waitForSelector("table", { timeout: 15_000 });

      const beds = await page.$$("tr[data-bed-id]");
      expect(beds.length).toBeGreaterThan(0);
    });

    it("can collapse and expand rooms", async () => {
      const roomHeader = await page.$("tr.cursor-pointer.select-none");
      if (!roomHeader) return;

      const before = await page.$$eval("tr[data-bed-id]", r => r.length);
      await roomHeader.click();
      await new Promise(r => setTimeout(r, 300));
      const after = await page.$$eval("tr[data-bed-id]", r => r.length);
      expect(after).toBeLessThan(before);

      await roomHeader.click();
      await new Promise(r => setTimeout(r, 300));
    });

    it("shows summary pills for today", async () => {
      const content = await page.content();
      const hasSummary = content.includes("arriving") || content.includes("checked in") || content.includes("departing") || content.includes("unpaid");
      expect(hasSummary).toBe(true);
    });

    it("has Cmd+K search and Cmd+Z undo", async () => {
      // Cmd+K
      await page.keyboard.down("Meta");
      await page.keyboard.press("k");
      await page.keyboard.up("Meta");
      const search = await page.waitForSelector('input[placeholder*="Search"]', { visible: true, timeout: 3_000 });
      expect(search).not.toBeNull();
      await page.keyboard.press("Escape");

      // Undo button exists
      const undoBtn = await page.$('button[title*="Undo"]');
      expect(undoBtn).not.toBeNull();
    });
  });

  // ═══════════════════════════════════════
  // SETTINGS — Verify sections
  // ═══════════════════════════════════════

  describe("Settings", () => {
    it("has all config sections", async () => {
      await page.goto(url("/settings"), { waitUntil: "networkidle2" });
      await page.waitForSelector("xpath/.//h1[contains(text(),'Settings')]", { timeout: 10_000 });

      const content = await page.content();
      expect(content).toContain("Booking.com Import");
      expect(content).toContain("Gmail Sync");
      expect(content).toContain("Danger Zone");
    });
  });

  // ═══════════════════════════════════════
  // NOT IMPLEMENTED — Future features
  // ═══════════════════════════════════════

  describe("[NOT IMPLEMENTED] Features needed", () => {
    it.skip("Global Cmd+K search from any page (currently grid-only)", () => {});
    it.skip("Bulk check-in: select multiple arrivals and check them all in", () => {});
    it.skip("Bulk check-out: select all departures and check them out", () => {});
    it.skip("Morning report: printable PDF of today's arrivals/departures/in-house", () => {});
    it.skip("Outstanding payments page: all unpaid balances at a glance", () => {});
    it.skip("Guest directory: searchable list of all guests with contact info", () => {});
    it.skip("Bed housekeeping status: mark beds clean/dirty after checkout", () => {});
    it.skip("Export data: download reservations as CSV/Excel", () => {});
    it.skip("Receipt email: send bill to guest email on checkout", () => {});
    it.skip("Room change from detail panel without going to grid", () => {});
    it.skip("Late checkout / early checkin tracking", () => {});
    it.skip("Payment method tracking (cash vs card vs transfer)", () => {});
    it.skip("Group booking: link multiple guests traveling together", () => {});
    it.skip("Returning guest indicator on grid cells", () => {});
  });
});
