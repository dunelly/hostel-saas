import { defineConfig } from "vitest/config";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local manually
function loadEnvLocal() {
  try {
    const envPath = resolve(process.cwd(), ".env.local");
    const content = readFileSync(envPath, "utf-8");
    const env: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
    return env;
  } catch {
    return {};
  }
}

export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    env: loadEnvLocal(),
  },
});
