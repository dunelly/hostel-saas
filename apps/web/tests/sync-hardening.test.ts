import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("sync hardening", () => {
  it("protects manual Gmail sync with the same import API key header", () => {
    const route = read("apps/web/src/app/api/gmail/sync/route.ts");

    expect(route).toContain('process.env.IMPORT_API_KEY');
    expect(route).toContain('request.headers.get("x-api-key")');
    expect(route).toContain('return NextResponse.json({ error: "Unauthorized" }, { status: 401 })');
  });

  it("forwards mirror Gmail imports and cancellations with the import API key", () => {
    const sync = read("apps/web/src/lib/gmail/sync.ts");

    expect(sync).toContain('"x-api-key": importApiKey');
    expect(sync).toContain("if (mirrorUrl && importApiKey && parsed.length > 0)");
    expect(sync).toContain("if (mirrorUrl && importApiKey && cancellationIds.length > 0)");
  });

  it("builds Booking.com sync URLs 90 days ahead", () => {
    const serviceWorker = read("extensions/chrome/src/background/service-worker.js");

    expect(serviceWorker).toContain("Date.now() + 90 * 864e5");
  });

  it("sends the import API key when the extension triggers Gmail sync", () => {
    const serviceWorker = read("extensions/chrome/src/background/service-worker.js");
    const triggerStart = serviceWorker.indexOf("async function triggerGmailSync()");
    const triggerEnd = serviceWorker.indexOf("async function setGmailAutoSync", triggerStart);
    const triggerGmailSync = serviceWorker.slice(triggerStart, triggerEnd);

    expect(triggerGmailSync).toContain('const { apiKey } = await getSettings();');
    expect(triggerGmailSync).toContain('const headers = { "Content-Type": "application/json", "x-api-key": apiKey };');
    expect(triggerGmailSync).toContain('fetch(`${url}/api/gmail/sync`, { method: "POST", headers, body })');
  });
});
