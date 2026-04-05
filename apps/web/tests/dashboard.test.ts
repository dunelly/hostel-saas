import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Page } from "puppeteer";
import { newPage, closeBrowser, url, waitForSeed, getText } from "./helpers";

describe("Dashboard", () => {
  let page: Page;

  beforeAll(async () => {
    page = await newPage();
    await page.goto(url("/"), { waitUntil: "networkidle2" });
    await waitForSeed(page);
  });

  afterAll(async () => {
    await page?.close();
    await closeBrowser();
  });

  it("displays stat cards with real values", async () => {
    // Wait for stat cards to render (labels are uppercase span.text-xs)
    await page.waitForFunction(
      () => {
        const labels = document.querySelectorAll("span.tracking-wider");
        return labels.length >= 4;
      },
      { timeout: 15_000 }
    );

    // Get the value from the Total Beds card
    const totalBeds = await page.evaluate(() => {
      const labels = document.querySelectorAll("span.tracking-wider");
      for (const label of labels) {
        if (label.textContent?.includes("Total Beds")) {
          const card = label.closest(".bg-white");
          const value = card?.querySelector(".text-2xl");
          return value?.textContent?.trim() || "0";
        }
      }
      return "0";
    });
    expect(Number(totalBeds)).toBeGreaterThan(0);
  });

  it("shows the occupancy chart section", async () => {
    const heading = await getText(page, "xpath/.//h2[contains(text(),'Occupancy')]");
    expect(heading).toContain("Occupancy");
  });

  it("shows quick action links", async () => {
    const quickActions = await getText(page, "xpath/.//h2[contains(text(),'Quick Actions')]");
    expect(quickActions).toContain("Quick Actions");
  });

  it("navigates to grid via sidebar", async () => {
    await page.click('aside a[href="/grid"]');
    await page.waitForNavigation({ waitUntil: "networkidle2" });
    expect(page.url()).toContain("/grid");

    // Navigate back
    await page.goto(url("/"), { waitUntil: "networkidle2" });
    await waitForSeed(page);
  });

  it("navigates to reservations via sidebar", async () => {
    await page.click('aside a[href="/reservations"]');
    await page.waitForNavigation({ waitUntil: "networkidle2" });
    expect(page.url()).toContain("/reservations");
  });
});
