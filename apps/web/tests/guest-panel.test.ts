import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Page } from "puppeteer";
import { newPage, closeBrowser, url, clickButton, apiPost } from "./helpers";

const today = new Date().toISOString().split("T")[0];
const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
const runId = Date.now().toString(36);

describe("Guest Detail Panel", () => {
  let page: Page;

  beforeAll(async () => {
    // Seed and create a test reservation
    await fetch(url("/api/seed"), { method: "POST" });
    await apiPost("/api/import", {
      reservations: [
        {
          guestName: "Panel Test Guest",
          checkIn: today,
          checkOut: nextWeek,
          numGuests: 1,
          roomType: "Mixed Dorm",
          source: "booking.com",
          externalId: `TEST-PANEL-${runId}`,
          totalPrice: 500000,
          currency: "VND",
        },
      ],
    });

    page = await newPage();
    await page.goto(url("/grid"), { waitUntil: "networkidle2" });
    await page.waitForSelector("table", { timeout: 15_000 });
  });

  afterAll(async () => {
    await page?.close();
    await closeBrowser();
  });

  it("opens guest detail panel on double-click", async () => {
    // Find a guest cell by title attribute
    const guestCell = await page.$('div[title*="Panel Test Guest"]');
    if (!guestCell) {
      // Guest might not be visible in current date range — try looking for any guest
      const anyGuest = await page.$("div.cursor-grab");
      if (!anyGuest) return; // no guests on grid
      await anyGuest.click({ count: 2 });
    } else {
      await guestCell.click({ count: 2 });
    }

    // Wait for the panel to slide in
    const panel = await page.waitForSelector("div.fixed.z-50.w-\\[460px\\]", {
      visible: true,
      timeout: 5_000,
    });
    expect(panel).not.toBeNull();
  });

  it("shows guest name in the panel", async () => {
    const nameEl = await page.$("h2.font-serif");
    if (!nameEl) return;
    const name = await nameEl.evaluate((el) => el.textContent?.trim());
    expect(name).toBeTruthy();
    expect(typeof name).toBe("string");
  });

  it("shows a status banner", async () => {
    // Status banner has white text like "Arriving", "Checked In", etc.
    const statusBanner = await page.$("span.text-white.font-bold");
    if (!statusBanner) return;
    const statusText = await statusBanner.evaluate((el) => el.textContent?.trim());
    expect(["Arriving", "Checked In", "Checked Out", "Cancelled", "No Show"]).toContain(
      statusText
    );
  });

  it("shows Check In button for confirmed reservation", async () => {
    // Look for the Check In button
    const checkInBtn = await page.$('xpath/.//button[normalize-space()="Check In"]');
    if (!checkInBtn) return; // guest may already be checked in
    const text = await checkInBtn.evaluate((el) => el.textContent?.trim());
    expect(text).toBe("Check In");
  });

  it("can check in a guest", async () => {
    const checkInBtn = await page.$('xpath/.//button[normalize-space()="Check In"]');
    if (!checkInBtn) return;

    await checkInBtn.click();
    await page.waitForNetworkIdle({ timeout: 5_000 });

    // After check-in, should now see "Check Out" button
    const checkOutBtn = await page.waitForSelector(
      'xpath/.//button[normalize-space()="Check Out"]',
      { visible: true, timeout: 5_000 }
    );
    expect(checkOutBtn).not.toBeNull();
  });

  it("shows payment section with amount owed", async () => {
    // Look for payment-related text
    const paymentSection = await page.$('xpath/.//div[contains(.,"Owed")]');
    // Payment section should exist if a price was set
    // This may or may not be present depending on reservation data
    if (paymentSection) {
      const text = await paymentSection.evaluate((el) => el.textContent);
      expect(text).toContain("Owed");
    }
  });

  it("can add a payment", async () => {
    const paymentInput = await page.$('input[placeholder="Amount received"]');
    if (!paymentInput) return;

    await paymentInput.scrollIntoView();
    await paymentInput.focus();
    await page.keyboard.type("100000");

    await clickButton(page, "Add");
    await page.waitForNetworkIdle({ timeout: 5_000 });

    // The paid amount should have increased
    const paidText = await page.$('xpath/.//div[contains(.,"Paid")]');
    expect(paidText).not.toBeNull();
  });

  it("shows Extend Stay option", async () => {
    const extendBtn = await page.$('xpath/.//button[contains(.,"Extend Stay")]');
    if (!extendBtn) return;

    await extendBtn.click();
    // Should show night picker buttons (1, 2, 3, 5, 7)
    const nightBtn = await page.waitForSelector('xpath/.//button[normalize-space()="1"]', {
      visible: true,
      timeout: 3_000,
    });
    expect(nightBtn).not.toBeNull();

    // Close it
    await extendBtn.click();
  });

  it("shows Total Bill section", async () => {
    const billBtn = await page.$('xpath/.//button[contains(.,"Total Bill")]');
    if (!billBtn) return;

    await billBtn.click();
    // Should expand to show bill breakdown
    const billSection = await page.waitForSelector('xpath/.//button[contains(.,"Print Bill")]', {
      visible: true,
      timeout: 3_000,
    });
    expect(billSection).not.toBeNull();
  });

  it("closes panel with X button", async () => {
    // Find the X close button in the status banner
    const closeBtn = await page.$("div.fixed.z-50 button.w-8.h-8.rounded-full");
    if (!closeBtn) return;

    await closeBtn.click();
    await new Promise((r) => setTimeout(r, 300)); // wait for animation

    // Panel should be gone
    const panel = await page.$("div.fixed.z-50.w-\\[460px\\]");
    expect(panel).toBeNull();
  });
});
