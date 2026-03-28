import { db } from "./index";
import { sql } from "drizzle-orm";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

export async function migrate() {
  // Create migrations tracking table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const migrationsDir = join(process.cwd(), "drizzle");

  let files: string[];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    console.log("No migrations directory found");
    return;
  }

  for (const file of files) {
    // Check if already applied
    const applied = await db.all(
      sql`SELECT id FROM __drizzle_migrations WHERE name = ${file}`
    );
    if (applied.length > 0) continue;

    const migration = readFileSync(join(migrationsDir, file), "utf-8");

    // Split by statement breakpoints and execute each
    const statements = migration
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await db.run(sql.raw(statement));
    }

    await db.run(
      sql`INSERT INTO __drizzle_migrations (name) VALUES (${file})`
    );
    console.log(`Applied migration: ${file}`);
  }
}
