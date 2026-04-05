import puppeteer, { type Browser, type Page } from "puppeteer";

const BASE_URL = process.env.TEST_URL || "http://localhost:3000";

let browser: Browser;

export async function launchBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browser;
}

export async function newPage(): Promise<Page> {
  const b = await launchBrowser();
  const page = await b.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  return page;
}

export async function closeBrowser() {
  if (browser?.connected) {
    await browser.close();
  }
}

export function url(path: string): string {
  return `${BASE_URL}${path}`;
}

/** Wait for the dashboard seed to complete (the "Setting up database..." banner to vanish) */
export async function waitForSeed(page: Page) {
  // The seed banner has bg-indigo-50 class with "Setting up" text
  // Wait for it to appear and then disappear, or just wait for stats
  await page.waitForFunction(
    () => !document.querySelector("body")?.textContent?.includes("Setting up database"),
    { timeout: 15_000 }
  );
}

/** Click a button by its visible text content */
export async function clickButton(page: Page, text: string) {
  const btn = await page.waitForSelector(`xpath/.//button[contains(., "${text}")]`, {
    visible: true,
    timeout: 10_000,
  });
  await btn!.click();
}

/** Click a link by href */
export async function clickLink(page: Page, href: string) {
  await page.click(`a[href="${href}"]`);
}

/** Type into an input identified by placeholder */
export async function typeInto(page: Page, placeholder: string, value: string) {
  const input = await page.waitForSelector(`input[placeholder="${value ? placeholder : placeholder}"]`, {
    visible: true,
  });
  await input!.click({ clickCount: 3 }); // select all
  await input!.type(value);
}

/** Get text content of an element matching a selector */
export async function getText(page: Page, selector: string): Promise<string> {
  const el = await page.waitForSelector(selector, { visible: true, timeout: 10_000 });
  return (await el!.evaluate((e) => e.textContent?.trim())) || "";
}

/** POST JSON to an API endpoint and return the response */
export async function apiPost(path: string, body: object): Promise<{ status: number; data: unknown }> {
  const apiKey = process.env.IMPORT_API_KEY || "";
  const res = await fetch(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

/** DELETE to an API endpoint */
export async function apiDelete(path: string): Promise<{ status: number; data: unknown }> {
  const res = await fetch(url(path), { method: "DELETE" });
  const data = await res.json();
  return { status: res.status, data };
}

/** GET from an API endpoint */
export async function apiGet(path: string): Promise<{ status: number; data: unknown }> {
  const res = await fetch(url(path));
  const data = await res.json();
  return { status: res.status, data };
}
