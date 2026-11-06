import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { openDatabase, root } from "../src/db.js";
import { devotionals } from "../src/schema.js";

const VERIFIED_MANUSCRIPT_SHA256 =
  "e0532ceead4dd0bab9741237f9216d626412714353faaf0fc75ec93dbb2e2b07";

const store = openDatabase();
const count = store.db
  .select({ count: sql<number>`count(*)` })
  .from(devotionals)
  .get()!.count;

const extractedPath = resolve(
  root,
  "private/manuscript/extracted/entries.json",
);
const pdfPath = resolve(root, "private/manuscript/devotional-2027.pdf");

if (count === 0 && existsSync(extractedPath)) {
  const entries = JSON.parse(readFileSync(extractedPath, "utf8")) as Array<{
    date: string;
    title: string;
    theme: string;
    bibleText: string;
    memoryVerse: string;
    reflection: string;
    thinkAbout: string;
    prayer: string;
    challenge: string;
    sample: boolean;
    published: boolean;
    sourcePages?: string;
  }>;

  let canPublishReviewedFirstWeek = false;
  if (existsSync(pdfPath)) {
    const digest = createHash("sha256")
      .update(readFileSync(pdfPath))
      .digest("hex");
    canPublishReviewedFirstWeek = digest === VERIFIED_MANUSCRIPT_SHA256;
  }

  const now = new Date().toISOString();
  store.sqlite.transaction(() => {
    for (const e of entries) {
      const isReviewedFirstWeek =
        canPublishReviewedFirstWeek &&
        e.date >= "2027-01-01" &&
        e.date <= "2027-01-07";
      const isFlaggedAnomaly = e.date === "2027-02-13";
      store.db
        .insert(devotionals)
        .values({
          ...e,
          published: isReviewedFirstWeek,
          sample: e.date === "2027-01-01",
          reviewStatus: isReviewedFirstWeek
            ? "approved"
            : isFlaggedAnomaly
              ? "needs_revision"
              : "pending_review",
          reviewerNotes: isFlaggedAnomaly
            ? "Nested section label detected during extraction; verify field boundaries against manuscript page 27 before approval."
            : "",
          reviewedAt: isReviewedFirstWeek ? now : null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .run();
    }
  })();
}

const finalCount = store.db
  .select({ count: sql<number>`count(*)` })
  .from(devotionals)
  .get()!.count;

store.sqlite.close();
console.log(
  `Database migrations and default records applied. Total devotionals in database: ${finalCount}.`,
);

