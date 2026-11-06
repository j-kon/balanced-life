import "./config.js";
import { openDatabase } from "./db.js";
import { seedDatabase } from "./demo-seed.js";
if (process.env.NODE_ENV === "production" || process.env.DEMO_MODE === "false")
  throw new Error("Local demo seed is disabled outside demo development.");
const store = openDatabase();
await seedDatabase(store, true);
store.sqlite.close();
console.log(
  "Local plans and demo accounts seeded. Existing account data was preserved.",
);
