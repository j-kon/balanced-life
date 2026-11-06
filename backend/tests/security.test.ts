import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/auth.js";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("password derivation is salted and rejects a wrong password", async () => {
  const a = await hashPassword("Correct-horse-2027!"),
    b = await hashPassword("Correct-horse-2027!");
  assert.notEqual(a, b);
  assert.ok(!a.includes("Correct-horse"));
  assert.equal(await verifyPassword("Correct-horse-2027!", a), true);
  assert.equal(await verifyPassword("wrong", a), false);
});
test("expired memberships and sessions are denied; inactive plans and disabled demo checkout cannot activate", async () => {
  const folder = mkdtempSync(join(tmpdir(), "balanced-security-")),
    databasePath = join(folder, "test.sqlite");
  const app = await buildApp({ databasePath, demo: true, seed: true });
  const store = openDatabase(databasePath);
  try {
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/demo",
      payload: { role: "subscriber" },
      headers: { "x-requested-with": "BalancedLife" },
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const headers = { cookie, "x-requested-with": "BalancedLife" };
    const now = new Date().toISOString();
    store.sqlite
      .prepare(
        "INSERT INTO devotionals(date,title,reflection,published,created_at,updated_at) VALUES ('2027-01-01','Security fixture','Secret premium text',1,?,?)",
      )
      .run(now, now);
    store.sqlite
      .prepare("UPDATE subscriptions SET expires_at='2000-01-01T00:00:00.000Z'")
      .run();
    assert.equal(
      (await app.inject({ url: "/api/v1/devotionals/1", headers })).statusCode,
      403,
    );
    store.sqlite
      .prepare("UPDATE subscription_plans SET active=0 WHERE id=1")
      .run();
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/checkout/demo",
          headers,
          payload: {
            planId: 1,
            renewalMode: "manual",
            reference: "inactive-plan-reference",
          },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      store.sqlite.prepare("SELECT count(*) AS n FROM payments").get()!.n,
      0,
    );
    store.sqlite
      .prepare("UPDATE sessions SET expires_at='2000-01-01T00:00:00.000Z'")
      .run();
    assert.equal(
      (await app.inject({ url: "/api/v1/me/journal", headers })).statusCode,
      401,
    );
    const locked = await buildApp({ databasePath, demo: false });
    try {
      assert.equal(
        (
          await locked.inject({
            method: "POST",
            url: "/api/v1/auth/demo",
            payload: { role: "admin" },
            headers: { "x-requested-with": "BalancedLife" },
          })
        ).statusCode,
        404,
      );
    } finally {
      await locked.close();
    }
  } finally {
    store.sqlite.close();
    await app.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
