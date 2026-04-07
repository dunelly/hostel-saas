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

  it("drag overlay shows a cell-like element (not just a text pill)", async () => {
    // Find a guest cell that has a reservation bar
    const guestCell = await page.$(".reservation-bar, [class*='bg-emerald-100'], [class*='bg-blue-100']");
    if (!guestCell) {
      console.log("No guest cells found — skipping drag overlay test");
      return;
    }

    const box = await guestCell.boundingBox();
    if (!box) return;

    // Start drag by holding pointer down
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Move far enough to activate drag (> 8px threshold)
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2);

    // DragOverlay should appear — look for the clone with drop-shadow-xl AND opacity-95 (GuestCellClone specific)
    const overlay = await page.waitForSelector(".drop-shadow-xl.opacity-95", { timeout: 3000 }).catch(() => null);
    expect(overlay).not.toBeNull();

    // Release
    await page.mouse.up();
  });

  it("dropping on own cell is a no-op (no error toast appears)", async () => {
    // Find a guest cell with a start position (has the name visible)
    const guestCells = await page.$$("[class*='bg-emerald-100'], [class*='bg-blue-100']");
    if (guestCells.length === 0) return;

    const box = await guestCells[0].boundingBox();
    if (!box) return;

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Drag from cell and drop back on itself
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 20, cy); // activate drag
    await page.mouse.move(cx, cy);       // drag back to source
    await page.mouse.up();

    // Wait briefly; no error toast should appear
    await new Promise((r) => setTimeout(r, 400));
    const errorToast = await page.$("[class*='bg-red'][class*='text-white'], .toast-error").catch(() => null);
    expect(errorToast).toBeNull();
  });
});
