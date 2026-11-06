import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/auth.js";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("password derivation is salted and rejects a wrong password", async () => {
  const a = await hashPassword("Correct-horse-2027!");
  const b = await hashPassword("Correct-horse-2027!");
  assert.notEqual(a, b);
  assert.ok(!a.includes("Correct-horse"));
  assert.equal(await verifyPassword("Correct-horse-2027!", a), true);
  assert.equal(await verifyPassword("wrong", a), false);
});

test("expired memberships and sessions are denied; unconfigured Paystack safely blocks checkout without fabricating payments", async () => {
  const folder = mkdtempSync(join(tmpdir(), "balanced-security-"));
  const databasePath = join(folder, "test.sqlite");
  const app = await buildApp({ databasePath });
  const store = openDatabase(databasePath);
  try {
    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "Security Reader",
        email: "security@example.org",
        password: "Security-Reader-2027!",
      },
      headers: { "x-requested-with": "BalancedLife" },
    });
    assert.equal(reg.statusCode, 200);
    const userId = reg.json().user.id;
    const cookie = String(reg.headers["set-cookie"]).split(";")[0];
    const headers = { cookie, "x-requested-with": "BalancedLife" };
    const now = new Date().toISOString();

    store.sqlite
      .prepare(
        "INSERT INTO devotionals(date,title,reflection,published,review_status,created_at,updated_at) VALUES ('2027-01-01','Security fixture','Secret premium text',1,'approved',?,?)",
      )
      .run(now, now);

    // Insert an expired subscription
    store.sqlite
      .prepare(
        "INSERT INTO subscriptions(user_id,plan_id,access_type,status,started_at,expires_at,renewal_mode,cancel_at_period_end,updated_at) VALUES (?,1,'complimentary','active','2000-01-01T00:00:00.000Z','2000-02-01T00:00:00.000Z','manual',0,?)",
      )
      .run(userId, now);

    assert.equal(
      (await app.inject({ url: "/api/v1/devotionals/1", headers })).statusCode,
      403,
    );

    // Unconfigured Paystack must return 503 and record 0 payments
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/subscriptions/checkout",
          headers,
          payload: {
            planId: 1,
            renewalMode: "manual",
          },
        })
      ).statusCode,
      503,
    );
    const paymentCount = store.sqlite
      .prepare("SELECT count(*) AS n FROM payments")
      .get() as { n: number };
    assert.equal(paymentCount.n, 0);

    // Expired session is rejected
    store.sqlite
      .prepare("UPDATE sessions SET expires_at='2000-01-01T00:00:00.000Z'")
      .run();
    assert.equal(
      (await app.inject({ url: "/api/v1/me/journal", headers })).statusCode,
      401,
    );
  } finally {
    store.sqlite.close();
    await app.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
