import { config } from "dotenv";
config({ path: "backend/.env", quiet: true });
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
if (process.env.NODE_ENV === "production" || process.env.DEMO_MODE === "false")
  throw new Error("Demo seed is development-only.");
const run = (args) =>
  execFileSync(process.execPath, args, { stdio: "inherit" });
run(["--import", "tsx", "backend/src/seed.ts"]);
run(["scripts/prepare-brand.mjs"]);
if (existsSync("private/manuscript/devotional-2027.pdf")) {
  run(["--import", "tsx", "backend/scripts/import-manuscript.ts", "--write"]);
  run(["--import", "tsx", "backend/scripts/publish-reviewed.ts"]);
} else
  console.log(
    "Manuscript not supplied. Accounts seeded without devotional content.",
  );
