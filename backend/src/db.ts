import "./config.js";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export function openDatabase(
  path = process.env.DATABASE_PATH ||
    resolve(root, "backend/data/devotional.sqlite"),
) {
  if (path !== ":memory:") {
    if (!isAbsolute(path)) path = resolve(root, "backend", path);
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)",
  );
  for (const file of readdirSync(resolve(root, "backend/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (
      !sqlite
        .prepare("SELECT name FROM schema_migrations WHERE name=?")
        .get(file)
    )
      sqlite.transaction(() => {
        sqlite.exec(
          readFileSync(resolve(root, "backend/migrations", file), "utf8"),
        );
        sqlite
          .prepare("INSERT INTO schema_migrations VALUES (?,?)")
          .run(file, new Date().toISOString());
      })();
  }
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
export type Store = ReturnType<typeof openDatabase>;
