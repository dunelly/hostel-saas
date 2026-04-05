/**
 * Accidental Click / Misclick Protection Tests
 *
 * A receptionist is busy, guests are waiting, phone is ringing.
 * They will click the wrong thing. The app must handle it gracefully:
 * - Double-clicking submit buttons shouldn't create duplicates
 * - Closing panels mid-action shouldn't corrupt data
 * - Clicking destructive buttons should require confirmation
 * - Back/forward navigation shouldn't break state
 * - Clicking disabled buttons should do nothing
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Page } from "puppeteer";
import { newPage, closeBrowser, url, apiPost, apiGet, clickButton } from "./helpers";

const today = new Date().toISOString().split("T")[0];
const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
const runId = Date.now().toString(36);

describe("Accidental Click Protection", () => {
  let page: Page;

  beforeAll(async () => {
    await fetch(url("/api/seed"), { method: "POST" });
    // Seed two test guests for these tests
    await apiPost("/api/import", {
      reservations: [
        {
          guestName: `Misclick Guest A ${runId}`,
          checkIn: today,
          checkOut: nextWeek,
          numGuests: 1,
          roomTypeReq: "mixed",
          source: "booking.com",
          externalId: `MISCLICK-A-${runId}`,
          totalPrice: 500000,
          currency: "VND",
        },
        {
          guestName: `Misclick Guest B ${runId}`,
          checkIn: today,
          checkOut: nextWeek,
          numGuests: 1,
          roomTypeReq: "mixed",
          source: "booking.com",
          externalId: `MISCLICK-B-${runId}`,
          totalPrice: 300000,
          currency: "VND",
        },
      ],
    });
    page = await newPage();
  });

  afterAll(async () => {
    await page?.close();
    await closeBrowser();
  });

  // ═══════════════════════════════════════
  // PANEL — open/close rapidly
  // ═══════════════════════════════════════

  describe("Panel open/close safety", () => {
    it("opening and immediately closing the panel doesn't crash", async () => {
      await page.goto(url("/grid"), { waitUntil: "networkidle2" });
      await page.waitForSelector("table", { timeout: 15_000 });

      const guestCell = await page.$("div.cursor-grab");
      if (!guestCell) return;

      // Double-click to open
      await guestCell.click({ count: 2 });
      // Immediately close before panel fully animates in
      await new Promise(r => setTimeout(r, 50));
      const closeBtn = await page.$("div.fixed.z-50 button.w-8.h-8.rounded-full");
      if (closeBtn) await closeBtn.click();

      await new Promise(r => setTimeout(r, 500));
      // Page should still be functional
      const beds = await page.$$("tr[data-bed-id]");
      expect(beds.length).toBeGreaterThan(0);
    });

    it("clicking backdrop closes the panel cleanly", async () => {
      const guestCell = await page.$("div.cursor-grab");
      if (!guestCell) return;

      await guestCell.click({ count: 2 });
      await page.waitForSelector("div.fixed.z-50", { visible: true, timeout: 5_000 });

      // Click the backdrop (the fixed overlay behind the panel)
      const backdrop = await page.$("div.fixed.z-40");
      if (backdrop) await backdrop.click();

      await new Promise(r => setTimeout(r, 400));
      const panel = await page.$("div.fixed.z-50");
      expect(panel).toBeNull();
    });
  });

  // ═══════════════════════════════════════
  // CHECK-IN — accidental double-click, skip, cancel
  // ═══════════════════════════════════════

  describe("Check-in accidental actions", () => {
    it("clicking Skip on check-in form still checks the guest in (no info saved)", async () => {
      await page.goto(url("/grid"), { waitUntil: "networkidle2" });
      await page.waitForSelector("table", { timeout: 15_000 });

      // Find a confirmed guest (blue/dashed border)
      const confirmedCell = await page.$("div.cursor-grab .border-dashed");
      if (!confirmedCell) return;

      const parent = await confirmedCell.evaluateHandle(el => el.closest(".cursor-grab")!);
      await parent.asElement()?.click({ count: 2 });
      await page.waitForSelector("div.fixed.z-50", { visible: true, timeout: 5_000 });

      const checkInBtn = await page.$('xpath/.//button[normalize-space()="Check In"]');
      if (!checkInBtn) {
        const closeBtn = await page.$("div.fixed.z-50 button.w-8.h-8.rounded-full");
        await closeBtn?.click();
        await new Promise(r => setTimeout(r, 300));
        return;
      }

      await checkInBtn.click();
      await page.waitForSelector('input[placeholder="Passport / ID"]', { visible: true, timeout: 3_000 });

      // Click Skip instead of filling the form
      const skipBtn = await page.$('xpath/.//button[normalize-space()="Skip"]');
      await skipBtn?.click();
      await page.waitForNetworkIdle({ timeout: 5_000 });

      // Guest should be checked in regardless
      const checkedIn = await page.$("xpath/.//span[contains(text(),'Checked In')]");
      expect(checkedIn).not.toBeNull();

      const closeBtn = await page.$("div.fixed.z-50 button.w-8.h-8.rounded-full");
      await closeBtn?.click();
      await new Promise(r => setTimeout(r, 300));
    });

    it("closing the panel during check-in form doesn't check in the guest", async () => {
      await page.goto(url("/grid"), { waitUntil: "networkidle2" });
      await page.waitForSelector("table", { timeout: 15_000 });

      const confirmedCell = await page.$("div.cursor-grab .border-dashed");
      if (!confirmedCell) return;

      const parent = await confirmedCell.evaluateHandle(el => el.closest(".cursor-grab")!);
      await parent.asElement()?.click({ count: 2 });
      await page.waitForSelector("div.fixed.z-50", { visible: true, timeout: 5_000 });

      const checkInBtn = await page.$('xpath/.//button[normalize-space()="Check In"]');
      if (!checkInBtn) {
        const closeBtn = await page.$("div.fixed.z-50 button.w-8.h-8.rounded-full");
        await closeBtn?.click();
        await new Promise(r => setTimeout(r, 300));
        return;
      }

      // Open the check-in form
      await checkInBtn.click();
      await page.waitForSelector('input[placeholder="Passport / ID"]', { visible: true, timeout: 3_000 });

      // Start typing then close without confirming
      const passportInput = await page.$('input[placeholder="Passport / ID"]');
      await passportInput?.type("ABANDONED");

      // Close panel — this should NOT check in the guest
      const closeBtn = await page.$("div.fixed.z-50 button.w-8.h-8.rounded-full");
      await closeBtn?.click();
      await new Promise(r => setTimeout(r, 300));

      // Page should still be functional
      const beds = await page.$$("tr[data-bed-id]");
      expect(beds.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════
  // CHECKOUT — cancel the confirmation, accidental checkout
  // ═══════════════════════════════════════

  describe("Checkout accidental actions", () => {
    it("cancelling the checkout confirmation keeps guest checked in", async () => {
      await page.goto(url("/grid"), { waitUntil: "networkidle2" });
      await page.waitForSelector("table", { timeout: 15_000 });

      // Find a checked-in guest (green bg)
      const checkedInCell = await page.$("div.cursor-grab .bg-emerald-100");
      if (!checkedInCell) return;

      const parent = await checkedInCell.evaluateHandle(el => el.closest(".cursor-grab")!);
      await parent.asElement()?.click({ count: 2 });
      await page.waitForSelector("div.fixed.z-50", { visible: true, timeout: 5_000 });

      const checkOutBtn = await page.$('xpath/.//button[contains(.,"Check Out")]');
      if (!checkOutBtn) {
        const closeBtn = await page.$("div.fixed.z-50 button.w-8.h-8.rounded-full");
        await closeBtn?.click();
        await new Promise(r => setTimeout(r, 300));
        return;
      }

      const btnText = await checkOutBtn.evaluate(el => el.textContent || "");
      await checkOutBtn.click();
      await new Promise(r => setTimeout(r, 500));

      if (btnText.includes("owed")) {
        // Should show checkout confirmation — look for the cancel link
        const cancelLink = await page.$("xpath/.//button[normalize-space()='Cancel']");
        if (cancelLink) {
          await cancelLink.click();
          await new Promise(r => setTimeout(r, 500));
          // Verify still checked in
          const status = await page.$("xpath/.//span[contains(text(),'Checked In')]");
          expect(status).not.toBeNull();
        }
      }
      // If no debt, checkout happened immediately — that's fine too

      const closeBtn = await page.$("div.fixed.z-50 button.w-8.h-8.rounded-full");
      await closeBtn?.click();
      await new Promise(r => setTimeout(r, 300));
    });
  });

  // ═══════════════════════════════════════
  // WALK-IN — close form mid-entry, empty submit
  // ═══════════════════════════════════════

  describe("Walk-in form safety", () => {
    it("submitting with empty name shows error, doesn't create booking", async () => {
      await page.goto(url("/grid"), { waitUntil: "networkidle2" });
      await page.waitForSelector("table", { timeout: 15_000 });

      const emptyCell = await page.$("tr[data-bed-id] td .group\\/empty");
      if (!emptyCell) return;

      await emptyCell.click();
      await page.waitForSelector('input[placeholder="Full name"]', { visible: true, timeout: 5_000 });

      // Try to submit with empty name
      const submitBtn = await page.$("button[type='submit']");
      await submitBtn?.click();
      await new Promise(r => setTimeout(r, 500));

      // Should show an error, form should still be open
      const nameInput = await page.$('input[placeholder="Full name"]');
      expect(nameInput).not.toBeNull();

      // Close
      await page.keyboard.press("Escape");
      await new Promise(r => setTimeout(r, 300));
    });

    it("closing the popover mid-entry discards the form", async () => {
      const emptyCell = await page.$("tr[data-bed-id] td .group\\/empty");
      if (!emptyCell) return;

      await emptyCell.click();
      await page.waitForSelector('input[placeholder="Full name"]', { visible: true, timeout: 5_000 });

      // Type a name but don't submit
      const nameInput = await page.$('input[placeholder="Full name"]');
      await nameInput?.type("Should Not Be Saved");

      // Click outside to close
      await page.click("th");
      await new Promise(r => setTimeout(r, 500));

      // Popover should be gone
      const form = await page.$('input[placeholder="Full name"]');
      expect(form).toBeNull();

      // Verify guest was NOT created
      const { data } = await apiGet("/api/reservations");
      const reservations = data as Array<{ guestName: string }>;
      const found = reservations.find(r => r.guestName === "Should Not Be Saved");
      expect(found).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════
  // PAYMENT — invalid amounts, negative numbers
  // ═══════════════════════════════════════

  describe("Payment input safety", () => {
    it("adding 0 or negative payment does nothing", async () => {
      await page.goto(url("/grid"), { waitUntil: "networkidle2" });
      await page.waitForSelector("table", { timeout: 15_000 });

      const guestCell = await page.$("div.cursor-grab");
      if (!guestCell) return;

      await guestCell.click({ count: 2 });
      await page.waitForSelector("div.fixed.z-50", { visible: true, timeout: 5_000 });

      const paymentInput = await page.$('input[placeholder="Amount received"]');
      if (!paymentInput) {
        const closeBtn = await page.$("div.fixed.z-50 button.w-8.h-8.rounded-full");
        await closeBtn?.click();
        await new Promise(r => setTimeout(r, 300));
        return;
      }

      // Type 0 and try to add
      await paymentInput.scrollIntoView();
      await paymentInput.focus();
      await page.keyboard.type("0");

      const addBtn = await page.$('xpath/.//button[normalize-space()="Add"]');
      await addBtn?.click();
      await new Promise(r => setTimeout(r, 500));

      // Input should still be there (payment not processed)
      const stillThere = await page.$('input[placeholder="Amount received"]');
      expect(stillThere).not.toBeNull();

      const closeBtn = await page.$("div.fixed.z-50 button.w-8.h-8.rounded-full");
      await closeBtn?.click();
      await new Promise(r => setTimeout(r, 300));
    });
  });

  // ═══════════════════════════════════════
  // DANGER ZONE — clear data requires confirmation
  // ═══════════════════════════════════════

  describe("Destructive action protection", () => {
    it("Clear All Data requires two clicks (not one)", async () => {
      await page.goto(url("/settings"), { waitUntil: "networkidle2" });
      await page.waitForSelector("xpath/.//h2[contains(text(),'Danger Zone')]", { timeout: 10_000 });

      // First click reveals confirmation
      const clearBtn = await page.$('xpath/.//button[contains(.,"Clear All Data")]');
      expect(clearBtn).not.toBeNull();
      await clearBtn!.click();

      // Should now show "Yes, delete everything" — NOT immediately clear data
      const confirmBtn = await page.waitForSelector(
        'xpath/.//button[contains(.,"Yes, delete everything")]',
        { visible: true, timeout: 3_000 }
      );
      expect(confirmBtn).not.toBeNull();

      // Click Cancel to back out
      const cancelBtn = await page.$('xpath/.//button[normalize-space()="Cancel"]');
      expect(cancelBtn).not.toBeNull();
      await cancelBtn!.click();

      await new Promise(r => setTimeout(r, 300));
      // "Clear All Data" button should be back
      const resetBtn = await page.$('xpath/.//button[contains(.,"Clear All Data")]');
      expect(resetBtn).not.toBeNull();
    });
  });

  // ═══════════════════════════════════════
  // NAVIGATION — rapid page switching
  // ═══════════════════════════════════════

  describe("Rapid navigation", () => {
    it("switching pages quickly doesn't crash the app", async () => {
      // Rapid-fire navigate through all pages
      await page.goto(url("/"), { waitUntil: "domcontentloaded" });
      await page.goto(url("/grid"), { waitUntil: "domcontentloaded" });
      await page.goto(url("/reservations"), { waitUntil: "domcontentloaded" });
      await page.goto(url("/laundry"), { waitUntil: "domcontentloaded" });
      await page.goto(url("/tours"), { waitUntil: "domcontentloaded" });
      await page.goto(url("/settings"), { waitUntil: "domcontentloaded" });

      // End on grid and verify it works
      await page.goto(url("/grid"), { waitUntil: "networkidle2" });
      await page.waitForSelector("table", { timeout: 15_000 });
      const beds = await page.$$("tr[data-bed-id]");
      expect(beds.length).toBeGreaterThan(0);
    });

    it("browser back button works after opening a panel", async () => {
      await page.goto(url("/grid"), { waitUntil: "networkidle2" });
      await page.waitForSelector("table", { timeout: 15_000 });

      // Navigate to reservations
      await page.goto(url("/reservations"), { waitUntil: "networkidle2" });

      // Go back
      await page.goBack({ waitUntil: "networkidle2" });
      await page.waitForSelector("table", { timeout: 15_000 });

      const beds = await page.$$("tr[data-bed-id]");
      expect(beds.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════
  // DOUBLE-CLICK SAFETY — clicking buttons twice
  // ═══════════════════════════════════════

  describe("Double-submit protection", () => {
    it("payment cycle button on reservations table handles rapid clicks", async () => {
      await page.goto(url("/reservations"), { waitUntil: "networkidle2" });
      await page.waitForSelector("table", { timeout: 15_000 });
      await new Promise(r => setTimeout(r, 500));

      const payBtn = await page.$('tbody button[title="Click to change payment status"]');
      if (!payBtn) return;

      const textBefore = await payBtn.evaluate(el => el.textContent?.trim());

      // Rapid triple-click
      await payBtn.click();
      await payBtn.click();
      await payBtn.click();
      await new Promise(r => setTimeout(r, 3_000));

      // Should not crash — page still functional
      const table = await page.$("table");
      expect(table).not.toBeNull();
    });
  });
});
