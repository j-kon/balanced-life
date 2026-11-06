import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { addMonths } from "../src/subscriptions.js";
let app: Awaited<ReturnType<typeof buildApp>>;
let admin = "",
  subscriber = "",
  guest = "";
const send = (method: any, url: string, payload?: any, cookie = "") =>
  app.inject({
    method,
    url: "/api/v1" + url,
    payload,
    headers: { cookie, "x-requested-with": "BalancedLife" },
  });
before(async () => {
  app = await buildApp({ databasePath: ":memory:", demo: true, seed: true });
  await app.ready();
  for (const role of ["admin", "subscriber", "guest"]) {
    const r = await send("POST", "/auth/demo", { role });
    assert.equal(r.statusCode, 200);
    const c = r.headers["set-cookie"]!.toString().split(";")[0];
    if (role === "admin") admin = c;
    else if (role === "subscriber") subscriber = c;
    else guest = c;
  }
});
after(async () => {
  await app?.close();
});
const entry = {
  date: "2027-01-01",
  title: "Authorization test fixture",
  theme: "Test only",
  bibleText: "TEST BIBLE FIELD",
  memoryVerse: "TEST MEMORY FIELD",
  reflection: "PRIVATE TEST BODY",
  thinkAbout: "TEST QUESTION",
  prayer: "TEST PRAYER",
  challenge: "TEST CHALLENGE",
  sample: false,
  published: true,
};
test("calendar months clamp month-end and leap years", () => {
  assert.equal(
    addMonths("2027-01-31T10:00:00.000Z", 1),
    "2027-02-28T10:00:00.000Z",
  );
  assert.equal(
    addMonths("2028-01-31T10:00:00.000Z", 1),
    "2028-02-29T10:00:00.000Z",
  );
});
test("authentication cookies are HTTP-only and login rejects wrong passwords", async () => {
  const r = await send("POST", "/auth/demo", { role: "guest" });
  assert.match(String(r.headers["set-cookie"]), /HttpOnly/);
  assert.match(String(r.headers["set-cookie"]), /SameSite=Strict/);
  assert.equal(
    (
      await send("POST", "/auth/login", {
        email: "guest@balanced.test",
        password: "wrong",
      })
    ).statusCode,
    401,
  );
});
test("registration validates, ignores role injection, and hashes passwords", async () => {
  assert.equal(
    (
      await send("POST", "/auth/register", {
        name: "A",
        email: "wrong",
        password: "short",
      })
    ).statusCode,
    400,
  );
  const r = await send("POST", "/auth/register", {
    name: "New Reader",
    email: "reader@example.com",
    password: "A-long-password-27",
    role: "admin",
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().user.role, "reader");
  assert.equal(r.json().user.passwordHash, undefined);
});
test("guest and anonymous callers cannot access administration", async () => {
  assert.equal((await send("GET", "/admin/overview")).statusCode, 401);
  assert.equal(
    (await send("GET", "/admin/overview", undefined, guest)).statusCode,
    403,
  );
  assert.equal(
    (await send("POST", "/admin/devotionals", entry, guest)).statusCode,
    403,
  );
});
test("premium bodies never leak through library and require membership", async () => {
  const created = await send("POST", "/admin/devotionals", entry, admin);
  assert.equal(created.statusCode, 200);
  const id = created.json().id;
  assert.equal((await send("GET", "/devotionals/" + id)).statusCode, 403);
  assert.equal(
    (await send("GET", "/devotionals/" + id, undefined, guest)).statusCode,
    403,
  );
  assert.equal(
    (await send("GET", "/devotionals/" + id, undefined, subscriber)).json()
      .reflection,
    entry.reflection,
  );
  assert.ok(
    !(await send("GET", "/devotionals")).body.includes(entry.reflection),
  );
  assert.equal(
    (await send("POST", "/me/progress/" + id, { completed: true }, guest))
      .statusCode,
    403,
  );
  assert.equal(
    (await send("POST", "/me/progress/" + id, { completed: true }, subscriber))
      .statusCode,
    200,
  );
});
test("drafts remain hidden, free samples are readable, publication validates content", async () => {
  const created = await send(
    "POST",
    "/admin/devotionals",
    { ...entry, date: "2027-01-02", sample: true, published: false },
    admin,
  );
  const id = created.json().id;
  assert.equal(
    (await send("GET", "/devotionals/" + id, undefined, subscriber)).statusCode,
    404,
  );
  await send(
    "PUT",
    "/admin/devotionals/" + id,
    { ...entry, date: "2027-01-02", sample: true, published: true },
    admin,
  );
  assert.equal((await send("GET", "/devotionals/" + id)).statusCode, 200);
  assert.equal(
    (
      await send(
        "POST",
        "/admin/devotionals",
        { ...entry, date: "2027-01-03", reflection: "" },
        admin,
      )
    ).statusCode,
    400,
  );
});
test("private journals are scoped to owners, including deletion", async () => {
  const r = await send(
    "POST",
    "/me/journal",
    { body: "PRIVATE JOURNAL TEST" },
    subscriber,
  );
  assert.equal(r.statusCode, 200);
  const id = r.json().id;
  assert.ok(
    !(await send("GET", "/me/journal", undefined, guest)).body.includes(
      "PRIVATE JOURNAL TEST",
    ),
  );
  assert.ok(
    !(await send("GET", "/admin/overview", undefined, admin)).body.includes(
      "PRIVATE JOURNAL TEST",
    ),
  );
  assert.equal(
    (await send("DELETE", "/me/journal/" + id, {}, guest)).statusCode,
    404,
  );
  assert.equal((await send("GET", "/me/journal")).statusCode, 401);
});
test("checkout is idempotent, cross-user references fail, cancellation preserves access, renewal extends", async () => {
  const body = {
    planId: 1,
    renewalMode: "automatic",
    reference: "test-payment-reference-001",
  };
  const r = await send("POST", "/checkout/demo", body, guest);
  assert.equal(r.statusCode, 200);
  const expiry = r.json().subscription.expiresAt;
  const again = await send("POST", "/checkout/demo", body, guest);
  assert.equal(again.json().subscription.expiresAt, expiry);
  assert.equal(
    (await send("POST", "/checkout/demo", body, subscriber)).statusCode,
    409,
  );
  await send("PATCH", "/me/subscription", { cancelAtPeriodEnd: true }, guest);
  const state = (
    await send("GET", "/me/subscription", undefined, guest)
  ).json();
  assert.equal(state.active, true);
  assert.equal(state.subscription.expiresAt, expiry);
  assert.equal(state.payments.length, 1);
  const renewed = await send(
    "POST",
    "/checkout/demo",
    { ...body, reference: "test-payment-reference-002" },
    guest,
  );
  assert.ok(renewed.json().subscription.expiresAt > expiry);
});
test("unsafe browser requests require origin and anti-CSRF header", async () => {
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        payload: {},
        headers: { cookie: guest },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        payload: {},
        headers: {
          cookie: guest,
          origin: "https://evil.example",
          "x-requested-with": "BalancedLife",
        },
      })
    ).statusCode,
    403,
  );
});
test("logout invalidates the session", async () => {
  const r = await send("POST", "/auth/demo", { role: "guest" });
  const cookie = String(r.headers["set-cookie"]).split(";")[0];
  await send("POST", "/auth/logout", {}, cookie);
  assert.equal(
    (await send("GET", "/auth/me", undefined, cookie)).json().user,
    null,
  );
});
test("demo mode cannot be enabled in production", async () => {
  await assert.rejects(
    () =>
      buildApp({
        databasePath: ":memory:",
        demo: true,
        environment: "production",
      }),
    /demo/i,
  );
});
