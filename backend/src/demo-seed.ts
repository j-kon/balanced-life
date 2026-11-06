import { eq } from "drizzle-orm";
import type { Store } from "./db.js";
import { users, plans, subscriptions, settings } from "./schema.js";
import { hashPassword } from "./auth.js";
export const demoAccounts = [
  {
    name: "Constance",
    email: "admin@balanced.test",
    password: "Demo-Admin-2027!",
    role: "admin",
    demoRole: "admin",
  },
  {
    name: "Grace",
    email: "subscriber@balanced.test",
    password: "Demo-Reader-2027!",
    role: "reader",
    demoRole: "subscriber",
  },
  {
    name: "Alex",
    email: "guest@balanced.test",
    password: "Demo-Guest-2027!",
    role: "reader",
    demoRole: "guest",
  },
];
export async function seedDatabase(store: Store, demo: boolean) {
  const { db } = store;
  for (const plan of [
    { name: "Monthly", months: 1, amountKobo: 100000 },
    { name: "Quarterly", months: 3, amountKobo: 270000 },
    { name: "Six months", months: 6, amountKobo: 480000 },
    { name: "Yearly", months: 12, amountKobo: 850000 },
  ])
    db.insert(plans).values(plan).onConflictDoNothing().run();
  db.insert(settings)
    .values({
      key: "referenceDate",
      value: process.env.DEMO_REFERENCE_DATE || "2027-01-01",
    })
    .onConflictDoNothing()
    .run();
  if (!demo) return;
  for (const account of demoAccounts) {
    let user = db
      .select()
      .from(users)
      .where(eq(users.email, account.email))
      .get();
    if (!user) {
      user = db
        .insert(users)
        .values({
          name: account.name,
          email: account.email,
          passwordHash: await hashPassword(account.password),
          role: account.role,
          createdAt: new Date().toISOString(),
        })
        .returning()
        .get();
    }
    if (account.demoRole === "subscriber") {
      const plan = db.select().from(plans).where(eq(plans.months, 12)).get()!;
      const expires = new Date();
      expires.setUTCFullYear(expires.getUTCFullYear() + 1);
      db.insert(subscriptions)
        .values({
          userId: user.id,
          planId: plan.id,
          startedAt: new Date().toISOString(),
          expiresAt: expires.toISOString(),
          renewalMode: "manual",
          isDemo: true,
        })
        .onConflictDoNothing()
        .run();
    }
  }
}
