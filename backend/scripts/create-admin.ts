import { eq } from "drizzle-orm";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { openDatabase } from "../src/db.js";
import { auditLogs, users } from "../src/schema.js";
import { hashPassword } from "../src/auth.js";
import { registerSchema } from "../src/validation.js";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    password: { type: "string" },
  },
  strict: false,
});

let email = (values.email as string) || process.env.ADMIN_EMAIL || "";
let name = (values.name as string) || process.env.ADMIN_NAME || "";
let password = (values.password as string) || process.env.ADMIN_PASSWORD || "";

if ((!email || !name || !password) && process.stdin.isTTY) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    if (!name) name = (await rl.question("Administrator full name: ")).trim();
    if (!email) email = (await rl.question("Administrator email: ")).trim();
    if (!password) {
      password = (
        await rl.question("Administrator password (min 10 characters): ")
      ).trim();
    }
  } finally {
    rl.close();
  }
}

if (!email || !name || !password) {
  console.error(
    'Usage: npm run admin:create -- --name "Full Name" --email admin@example.org --password "<strong-password>"',
  );
  process.exit(1);
}

const parsed = registerSchema.safeParse({ name, email, password });
if (!parsed.success) {
  console.error(
    "Invalid administrator details:",
    parsed.error.issues.map((i) => i.message).join(" "),
  );
  process.exit(1);
}

const store = openDatabase();
const now = new Date().toISOString();
const passwordHash = await hashPassword(parsed.data.password);

const existing = store.db
  .select()
  .from(users)
  .where(eq(users.email, parsed.data.email))
  .get();

let adminUser: typeof users.$inferSelect;
if (existing) {
  adminUser = store.db
    .update(users)
    .set({
      name: parsed.data.name,
      passwordHash,
      role: "admin",
      status: "active",
      suspendedReason: "",
      updatedAt: now,
    })
    .where(eq(users.id, existing.id))
    .returning()
    .get();
} else {
  adminUser = store.db
    .insert(users)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: "admin",
      status: "active",
      suspendedReason: "",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

store.db
  .insert(auditLogs)
  .values({
    adminId: adminUser.id,
    action: `${existing ? "Updated and promoted" : "Bootstrapped"} administrator account (${adminUser.email}) via CLI`,
    createdAt: now,
  })
  .run();

store.sqlite.close();
console.log(
  `Administrator account ready: ${adminUser.name} <${adminUser.email}> (id=${adminUser.id})`,
);

