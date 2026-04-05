import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Page } from "puppeteer";
import { newPage, closeBrowser, url, getText, clickButton } from "./helpers";

describe("Bed Grid", () => {
  let page: Page;

  beforeAll(async () => {
    // Seed the DB first
    await fetch(url("/api/seed"), { method: "POST" });
    page = await newPage();
    await page.goto(url("/grid"), { waitUntil: "networkidle2" });
    // Wait for the grid table to render
    await page.waitForSelector("table", { timeout: 15_000 });
  });

  afterAll(async () => {
    await page?.close();
    await closeBrowser();
  });

  it("renders the Room / Bed header", async () => {
    const header = await getText(page, "xpath/.//th[contains(.,'Room')]");
    expect(header).toContain("Room");
  });

  it("renders bed rows with data-bed-id attributes", async () => {
    const bedRows = await page.$$("tr[data-bed-id]");
    expect(bedRows.length).toBeGreaterThan(0);
  });

  it("renders date column headers", async () => {
    const dateHeaders = await page.$$("thead th");
    // First th is Room/Bed label, rest are dates
    expect(dateHeaders.length).toBeGreaterThan(7);
  });

  it("highlights today's column", async () => {
    // Today's column header should have a small indigo dot
    const todayDot = await page.$("th .bg-indigo-500.rounded-full");
    expect(todayDot).not.toBeNull();
  });

  it("navigates forward and back with period buttons", async () => {
    // Get current first date header text
    const getFirstDate = async () => {
      const headers = await page.$$("thead th");
      if (headers.length > 1) {
        return await headers[1].evaluate((el) => el.textContent?.trim());
      }
      return "";
    };

    const dateBefore = await getFirstDate();

    // Click next period (chevron right button)
    const nextBtn = await page.$("button.rounded-r-lg");
    await nextBtn?.click();
    await page.waitForNetworkIdle({ timeout: 5_000 });

    const dateAfter = await getFirstDate();
    // Dates should change after navigation
    expect(dateAfter).not.toBe(dateBefore);

    // Click "Today" to go back
    await clickButton(page, "Today");
    await page.waitForNetworkIdle({ timeout: 5_000 });
  });

  it("toggles period between 2W and 3W", async () => {
    const countDateHeaders = async () => {
      const headers = await page.$$("thead th");
      return headers.length - 1; // minus the Room/Bed column
    };

    // Click 3W
    await clickButton(page, "3W");
    await page.waitForNetworkIdle({ timeout: 5_000 });
    const threeWeekCount = await countDateHeaders();

    // Click 2W
    await clickButton(page, "2W");
    await page.waitForNetworkIdle({ timeout: 5_000 });
    const twoWeekCount = await countDateHeaders();

    expect(threeWeekCount).toBeGreaterThan(twoWeekCount);
  });

  it("opens QuickAddPopover when clicking an empty cell", async () => {
    // Find the first empty cell (a droppable div inside a td in a bed row)
    const emptyCell = await page.$("tr[data-bed-id] td .group\\/empty");
    if (!emptyCell) {
      // No empty cells visible (all occupied) — skip
      return;
    }

    await emptyCell.click();
    // The popover should appear with "New Walk-in" tab
    const popover = await page.waitForSelector('xpath/.//button[contains(.,"New Walk-in")]', {
      visible: true,
      timeout: 5_000,
    });
    expect(popover).not.toBeNull();

    // Close the popover by pressing Escape
    await page.keyboard.press("Escape");
  });

  it("opens command palette with Cmd+K", async () => {
    await page.keyboard.down("Meta");
    await page.keyboard.press("k");
    await page.keyboard.up("Meta");

    // Look for the search input
    const searchInput = await page.waitForSelector('input[placeholder*="Search"]', {
      visible: true,
      timeout: 5_000,
    });
    expect(searchInput).not.toBeNull();

    // Close it
    await page.keyboard.press("Escape");
  });

  it("collapses and expands a room group", async () => {
    // Room header rows are clickable tr elements with cursor-pointer
    const roomHeader = await page.$("tr.cursor-pointer.select-none");
    if (!roomHeader) return;

    // Count bed rows before collapse
    const bedCountBefore = await page.$$eval("tr[data-bed-id]", (rows) => rows.length);

    // Click to collapse
    await roomHeader.click();
    await new Promise((r) => setTimeout(r, 300)); // wait for animation

    const bedCountAfter = await page.$$eval("tr[data-bed-id]", (rows) => rows.length);
    expect(bedCountAfter).toBeLessThan(bedCountBefore);

    // Click to expand again
    await roomHeader.click();
    await new Promise((r) => setTimeout(r, 300));

    const bedCountRestored = await page.$$eval("tr[data-bed-id]", (rows) => rows.length);
    expect(bedCountRestored).toBe(bedCountBefore);
  });
});
