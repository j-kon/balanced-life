import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openDatabase, root } from "../src/db.js";
// PDF pages 5–8 were rendered and compared with all six fields for January 1–7.
// Review is bound to this exact source file, never to an arbitrary replacement PDF.
const expected =
  "e0532ceead4dd0bab9741237f9216d626412714353faaf0fc75ec93dbb2e2b07";
const digest = createHash("sha256")
  .update(readFileSync(resolve(root, "private/manuscript/devotional-2027.pdf")))
  .digest("hex");
if (digest !== expected)
  throw new Error(
    "The manuscript has changed. Review the extracted entries before publication.",
  );
const store = openDatabase();
const result = store.sqlite
  .prepare(
    "UPDATE devotionals SET published=1 WHERE date BETWEEN '2027-01-01' AND '2027-01-07' AND source_pages IS NOT NULL AND created_at=updated_at",
  )
  .run();
store.sqlite.close();
console.log("Visually reviewed January 1–7 entries available:", result.changes);
