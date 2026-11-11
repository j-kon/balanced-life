import Database from "better-sqlite3";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { root } from "../src/db.js";

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    verify: { type: "string" },
    source: { type: "string" },
  },
  strict: true,
});

function resolveDbPath(raw?: string): string {
  const value =
    raw?.trim() ||
    process.env.DATABASE_PATH?.trim() ||
    resolve(root, "backend/data/devotional.sqlite");
  return isAbsolute(value) ? value : resolve(root, "backend", value);
}

function verifyBackupSnapshot(backupFile: string) {
  const scratch = mkdtempSync(join(tmpdir(), "balanced-restore-verify-"));
  const restoredCopy = join(scratch, basename(backupFile));
  try {
    copyFileSync(backupFile, restoredCopy);
    const db = new Database(restoredCopy, { readonly: true });
    try {
      const integrity = db.pragma("integrity_check", { simple: true });
      if (integrity !== "ok") {
        throw new Error(`SQLite integrity_check failed: ${String(integrity)}`);
      }
      const fkViolations = db.pragma("foreign_key_check") as unknown[];
      if (fkViolations.length > 0) {
        throw new Error(
          `SQLite foreign_key_check found ${fkViolations.length} violations.`,
        );
      }
      const counts = {
        devotionals: (
          db.prepare("SELECT count(*) AS n FROM devotionals").get() as { n: number }
        ).n,
        users: (
          db.prepare("SELECT count(*) AS n FROM users").get() as { n: number }
        ).n,
        adminUsers: (
          db.prepare("SELECT count(*) AS n FROM admin_users").get() as { n: number }
        ).n,
        printedOrders: (
          db.prepare("SELECT count(*) AS n FROM printed_orders").get() as { n: number }
        ).n,
        digitalPurchases: (
          db.prepare("SELECT count(*) AS n FROM digital_purchases").get() as { n: number }
        ).n,
      };
      return { integrity, foreignKeyViolations: 0, counts };
    } finally {
      db.close();
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (values.verify) {
  const target = resolve(values.verify);
  const report = verifyBackupSnapshot(target);
  console.log(
    JSON.stringify({ ok: true, mode: "restore_verify", file: target, ...report }),
  );
  process.exit(0);
}

const sourcePath = resolveDbPath(values.source);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const targetPath = values.out
  ? resolve(values.out)
  : resolve(root, "private/backups", `devotional-backup-${stamp}.sqlite`);

mkdirSync(dirname(targetPath), { recursive: true });

const liveDb = new Database(sourcePath, { readonly: false });
liveDb.pragma("busy_timeout = 5000");

try {
  // Uses SQLite's native online backup API, safe with active WAL mode and readers.
  await liveDb.backup(targetPath);
  try {
    chmodSync(targetPath, 0o600);
  } catch {
    // Best effort on POSIX hosts
  }
} finally {
  liveDb.close();
}

const verification = verifyBackupSnapshot(targetPath);
console.log(
  JSON.stringify({
    ok: true,
    mode: "backup",
    source: sourcePath,
    backupFile: targetPath,
    ...verification,
  }),
);

