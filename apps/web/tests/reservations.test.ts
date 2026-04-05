import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Page } from "puppeteer";
import { newPage, closeBrowser, url, clickButton, apiPost } from "./helpers";

const today = new Date().toISOString().split("T")[0];
const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

describe("Reservations Page", () => {
  let page: Page;

  beforeAll(async () => {
    await fetch(url("/api/seed"), { method: "POST" });

    // Ensure we have test data via API (more reliable than UI form)
    await apiPost("/api/import", {
      reservations: [
        {
          guestName: "Res Test Guest",
          checkIn: today,
          checkOut: nextWeek,
          numGuests: 1,
          roomTypeReq: "mixed",
          source: "booking.com",
          externalId: "TEST-RES-PAGE-001",
          totalPrice: 300000,
          currency: "VND",
        },
      ],
    });

    page = await newPage();
    await page.goto(url("/reservations"), { waitUntil: "networkidle2" });
    await page.waitForSelector("table", { timeout: 15_000 });
    // Wait for data to load
    await new Promise((r) => setTimeout(r, 1_000));
  });

  afterAll(async () => {
    await page?.close();
    await closeBrowser();
  });

  it("renders the reservations table with headers", async () => {
    const headers = await page.$$eval("thead th", (ths) =>
      ths.map((th) => th.textContent?.trim())
    );
    expect(headers).toContain("Guest");
    expect(headers).toContain("Dates");
    expect(headers).toContain("Source");
    expect(headers).toContain("Status");
  });

  it("shows reservation data in the table", async () => {
    const pageContent = await page.content();
    expect(pageContent).toContain("Res Test Guest");
  });

  it("opens and closes the walk-in form", async () => {
    await clickButton(page, "Add Walk-in");

    // Wait for form to appear
    const nameInput = await page.waitForSelector('input[placeholder="Full name"]', {
      visible: true,
      timeout: 5_000,
    });
    expect(nameInput).not.toBeNull();

    // Close the form
    // The Cancel button is inside the form
    await clickButton(page, "Cancel");
    await new Promise((r) => setTimeout(r, 500));
  });

  it("searches for a guest by name", async () => {
    const searchInput = await page.waitForSelector(
      'input[placeholder="Search by guest name..."]',
      { visible: true }
    );

    // Clear and search
    await searchInput!.click({ clickCount: 3 });
    await searchInput!.type("Res Test Guest");
    await new Promise((r) => setTimeout(r, 500));

    const pageContent = await page.content();
    expect(pageContent).toContain("Res Test Guest");

    // Clear search
    await searchInput!.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await new Promise((r) => setTimeout(r, 500));
  });

  it("filters by source dropdown", async () => {
    const selects = await page.$$("select");
    if (selects.length < 1) return;

    // Filter to booking.com
    await selects[0].select("booking.com");
    await new Promise((r) => setTimeout(r, 500));

    // Should still see our booking.com guest
    const content = await page.content();
    expect(content).toContain("Res Test Guest");

    // Reset filter
    await selects[0].select("");
    await new Promise((r) => setTimeout(r, 300));
  });

  it("filters by status dropdown", async () => {
    const selects = await page.$$("select");
    if (selects.length < 3) return;

    // Filter to confirmed (our test guest should be confirmed)
    await selects[2].select("confirmed");
    await new Promise((r) => setTimeout(r, 500));

    // There should be at least one row
    const rows = await page.$$("tbody tr");
    expect(rows.length).toBeGreaterThanOrEqual(1);

    // Reset
    await selects[2].select("");
    await new Promise((r) => setTimeout(r, 300));
  });

  it("cycles payment status on click", async () => {
    const paymentBtn = await page.$('tbody button[title="Click to change payment status"]');
    if (!paymentBtn) return;

    const textBefore = await paymentBtn.evaluate((el) => el.textContent?.trim());
    await paymentBtn.click();
    await page.waitForNetworkIdle({ timeout: 5_000 });

    const textAfter = await paymentBtn.evaluate((el) => el.textContent?.trim());
    expect(textAfter).not.toBe(textBefore);
  });
});
