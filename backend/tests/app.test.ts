import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { addMonths } from "../src/services/subscriptions.js";
import { openDatabase } from "../src/db.js";
import { hashPassword } from "../src/auth.js";
import { users } from "../src/schema.js";
import type {
  PaymentInitializeInput,
  PaymentProvider,
} from "../src/services/payments.js";
import type {
  EmailService,
  PasswordResetEmailInput,
} from "../src/services/email.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

class MockPaystackProvider implements PaymentProvider {
  readonly name = "paystack" as const;
  readonly configured = true;
  readonly publicKey = "pk_test_mock";
  public initialized = new Map<string, number>();

  async initializeTransaction(input: PaymentInitializeInput) {
    this.initialized.set(input.reference, input.amountKobo);
    return {
      reference: input.reference,
      authorizationUrl: `https://checkout.paystack.com/${input.reference}`,
    };
  }

  async verifyTransaction(reference: string) {
    const amountKobo = this.initialized.get(reference) || 100000;
    return {
      reference,
      status: "succeeded" as const,
      amountKobo,
      currency: "NGN",
      providerTransactionId: "ps_tx_" + reference,
      paidAt: new Date().toISOString(),
    };
  }

  verifyWebhookSignature() {
    return true;
  }
}

class MockEmailService implements EmailService {
  readonly configured = true;
  public sent: PasswordResetEmailInput[] = [];

  async sendPasswordReset(input: PasswordResetEmailInput) {
    this.sent.push(input);
  }
}

let folder = "";
let databasePath = "";
let app: Awaited<ReturnType<typeof buildApp>>;
let paystackProvider: MockPaystackProvider;
let emailService: MockEmailService;
let adminCookie = "";
let subscriberCookie = "";
let subscriberId = 0;
let guestCookie = "";
let guestId = 0;

const send = (
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  payload?: unknown,
  cookie = "",
) =>
  app.inject({
    method,
    url: "/api/v1" + url,
    payload,
    headers: { cookie, "x-requested-with": "BalancedLife" },
  });

before(async () => {
  folder = mkdtempSync(join(tmpdir(), "balanced-app-test-"));
  databasePath = join(folder, "test.sqlite");

  // Bootstrap administrator in database
  const store = openDatabase(databasePath);
  const now = new Date().toISOString();
  store.db
    .insert(users)
    .values({
      name: "Constance Nwisi",
      email: "admin@cossyteensconsult.org",
      passwordHash: await hashPassword("Admin-Secure-Pass-2027!"),
      role: "admin",
      status: "active",
      suspendedReason: "",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  store.sqlite.close();

  paystackProvider = new MockPaystackProvider();
  emailService = new MockEmailService();
  app = await buildApp({
    databasePath,
    paymentProvider: paystackProvider,
    emailService,
  });
  await app.ready();

  const adminLogin = await send("POST", "/auth/login", {
    email: "admin@cossyteensconsult.org",
    password: "Admin-Secure-Pass-2027!",
  });
  assert.equal(adminLogin.statusCode, 200);
  adminCookie = String(adminLogin.headers["set-cookie"]).split(";")[0];

  const subReg = await send("POST", "/auth/register", {
    name: "Grace Reader",
    email: "grace@example.org",
    password: "Reader-Secure-Pass-2027!",
  });
  assert.equal(subReg.statusCode, 200);
  subscriberCookie = String(subReg.headers["set-cookie"]).split(";")[0];
  subscriberId = subReg.json().user.id;

  // Grant complimentary access to subscriber via admin endpoint
  const grantRes = await send(
    "POST",
    `/admin/users/${subscriberId}/complimentary`,
    { planId: 4, reason: "Editorial test subscriber" },
    adminCookie,
  );
  assert.equal(grantRes.statusCode, 200);

  const guestReg = await send("POST", "/auth/register", {
    name: "Alex Visitor",
    email: "alex@example.org",
    password: "Visitor-Secure-Pass-2027!",
  });
  assert.equal(guestReg.statusCode, 200);
  guestCookie = String(guestReg.headers["set-cookie"]).split(";")[0];
  guestId = guestReg.json().user.id;
});

after(async () => {
  await app?.close();
  if (folder) rmSync(folder, { recursive: true, force: true });
});

const entryFixture = {
  date: "2027-01-01",
  title: "Authorization test fixture",
  theme: "Gratitude, Identity & Intentionality",
  bibleText: "TEST BIBLE FIELD",
  memoryVerse: "TEST MEMORY FIELD",
  reflection: "PRIVATE TEST BODY",
  thinkAbout: "TEST QUESTION",
  prayer: "TEST PRAYER",
  challenge: "TEST CHALLENGE",
  sample: false,
  published: true,
  reviewStatus: "approved",
  reviewerNotes: "",
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

test("authentication cookies are HTTP-only, demo login endpoint is removed, and login rejects wrong passwords", async () => {
  const r = await send("POST", "/auth/login", {
    email: "alex@example.org",
    password: "Visitor-Secure-Pass-2027!",
  });
  assert.equal(r.statusCode, 200);
  assert.match(String(r.headers["set-cookie"]), /HttpOnly/);
  assert.match(String(r.headers["set-cookie"]), /SameSite=Strict/);

  assert.equal(
    (await send("POST", "/auth/demo", { role: "admin" })).statusCode,
    404,
  );
  assert.equal(
    (
      await send("POST", "/auth/login", {
        email: "alex@example.org",
        password: "wrong-password",
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

test("profile updates, password changes, and password reset token flow work securely", async () => {
  const prof = await send(
    "PATCH",
    "/me/profile",
    { name: "Alex Updated", email: "alex@example.org" },
    guestCookie,
  );
  assert.equal(prof.statusCode, 200);
  assert.equal(prof.json().user.name, "Alex Updated");

  const forgot = await send("POST", "/auth/forgot-password", {
    email: "alex@example.org",
  });
  assert.equal(forgot.statusCode, 200);
  assert.equal(emailService.sent.length, 1);
  const resetUrl = new URL(emailService.sent[0].resetUrl);
  const token = resetUrl.searchParams.get("token")!;
  assert.ok(token.length >= 32);

  const reset = await send("POST", "/auth/reset-password", {
    token,
    password: "Brand-New-Password-2027!",
  });
  assert.equal(reset.statusCode, 200);

  // Reusing the same token must fail
  assert.equal(
    (
      await send("POST", "/auth/reset-password", {
        token,
        password: "Another-Password-2027!",
      })
    ).statusCode,
    400,
  );

  // Re-login with new password
  const relogin = await send("POST", "/auth/login", {
    email: "alex@example.org",
    password: "Brand-New-Password-2027!",
  });
  assert.equal(relogin.statusCode, 200);
  guestCookie = String(relogin.headers["set-cookie"]).split(";")[0];
});

test("guest and anonymous callers cannot access administration", async () => {
  assert.equal((await send("GET", "/admin/overview")).statusCode, 401);
  assert.equal(
    (await send("GET", "/admin/overview", undefined, guestCookie)).statusCode,
    403,
  );
  assert.equal(
    (
      await send(
        "POST",
        "/admin/devotionals",
        entryFixture,
        guestCookie,
      )
    ).statusCode,
    403,
  );
});

test("premium bodies never leak through library and require membership", async () => {
  const created = await send(
    "POST",
    "/admin/devotionals",
    entryFixture,
    adminCookie,
  );
  assert.equal(created.statusCode, 200);
  const id = created.json().id;

  assert.equal((await send("GET", "/devotionals/" + id)).statusCode, 403);
  assert.equal(
    (await send("GET", "/devotionals/" + id, undefined, guestCookie))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await send("GET", "/devotionals/" + id, undefined, subscriberCookie)
    ).json().reflection,
    entryFixture.reflection,
  );
  assert.ok(
    !(await send("GET", "/devotionals")).body.includes(
      entryFixture.reflection,
    ),
  );
  assert.equal(
    (
      await send(
        "POST",
        "/me/progress/" + id,
        { completed: true },
        guestCookie,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await send(
        "POST",
        "/me/progress/" + id,
        { completed: true },
        subscriberCookie,
      )
    ).statusCode,
    200,
  );
});

test("drafts remain hidden, free samples are readable, publication validates content and review status", async () => {
  const created = await send(
    "POST",
    "/admin/devotionals",
    {
      ...entryFixture,
      date: "2027-01-02",
      sample: true,
      published: false,
      reviewStatus: "pending_review",
    },
    adminCookie,
  );
  const id = created.json().id;
  assert.equal(
    (
      await send("GET", "/devotionals/" + id, undefined, subscriberCookie)
    ).statusCode,
    404,
  );
  await send(
    "PUT",
    "/admin/devotionals/" + id,
    {
      ...entryFixture,
      date: "2027-01-02",
      sample: true,
      published: true,
      reviewStatus: "approved",
    },
    adminCookie,
  );
  assert.equal((await send("GET", "/devotionals/" + id)).statusCode, 200);

  // Missing section rejected when publishing
  assert.equal(
    (
      await send(
        "POST",
        "/admin/devotionals",
        { ...entryFixture, date: "2027-01-03", reflection: "" },
        adminCookie,
      )
    ).statusCode,
    400,
  );

  // Entry marked needs_revision cannot be published
  assert.equal(
    (
      await send(
        "POST",
        "/admin/devotionals",
        {
          ...entryFixture,
          date: "2027-01-04",
          published: true,
          reviewStatus: "needs_revision",
        },
        adminCookie,
      )
    ).statusCode,
    400,
  );
});

test("private journals are scoped to owners, including update and deletion", async () => {
  const r = await send(
    "POST",
    "/me/journal",
    { title: "Morning note", body: "PRIVATE JOURNAL TEST" },
    subscriberCookie,
  );
  assert.equal(r.statusCode, 200);
  const id = r.json().id;

  const upd = await send(
    "PUT",
    "/me/journal/" + id,
    { title: "Updated note", body: "PRIVATE JOURNAL TEST UPDATED" },
    subscriberCookie,
  );
  assert.equal(upd.statusCode, 200);

  assert.ok(
    !(await send("GET", "/me/journal", undefined, guestCookie)).body.includes(
      "PRIVATE JOURNAL TEST",
    ),
  );
  assert.ok(
    !(await send("GET", "/admin/overview", undefined, adminCookie)).body.includes(
      "PRIVATE JOURNAL TEST",
    ),
  );
  assert.equal(
    (await send("DELETE", "/me/journal/" + id, {}, guestCookie)).statusCode,
    404,
  );
  assert.equal((await send("GET", "/me/journal")).statusCode, 401);
});

test("complimentary access never counts as verified revenue; verified Paystack checkout is idempotent and extends access", async () => {
  // Before any paid checkout, subscriber has complimentary access; verified revenue must be 0
  const overviewBefore = (
    await send("GET", "/admin/overview", undefined, adminCookie)
  ).json();
  assert.equal(overviewBefore.metrics.verifiedRevenueKobo, 0);
  assert.equal(overviewBefore.metrics.complimentaryMemberships, 1);

  // Initiate Paystack checkout for guest
  const initRes = await send(
    "POST",
    "/subscriptions/checkout",
    { planId: 1, renewalMode: "automatic" },
    guestCookie,
  );
  assert.equal(initRes.statusCode, 200);
  const reference = initRes.json().reference;
  assert.ok(reference.startsWith("BLD_"));

  // Cross-user verification must be rejected
  assert.equal(
    (
      await send(
        "POST",
        "/subscriptions/verify",
        { reference },
        subscriberCookie,
      )
    ).statusCode,
    403,
  );

  // Verify transaction as guest
  const verifyRes = await send(
    "POST",
    "/subscriptions/verify",
    { reference },
    guestCookie,
  );
  assert.equal(verifyRes.statusCode, 200);
  const expiry = verifyRes.json().subscription.expiresAt;
  assert.equal(verifyRes.json().subscription.accessType, "paid");

  // Replaying verification is idempotent
  const replayRes = await send(
    "POST",
    "/subscriptions/verify",
    { reference },
    guestCookie,
  );
  assert.equal(replayRes.json().replayed, true);
  assert.equal(replayRes.json().subscription.expiresAt, expiry);

  // Cancel renewal preserves paid-through access
  await send(
    "PATCH",
    "/me/subscription",
    { cancelAtPeriodEnd: true },
    guestCookie,
  );
  const state = (
    await send("GET", "/me/subscription", undefined, guestCookie)
  ).json();
  assert.equal(state.active, true);
  assert.equal(state.subscription.effectiveStatus, "cancelling");
  assert.equal(state.subscription.expiresAt, expiry);
  assert.equal(state.payments.length, 1);

  // Verified revenue now equals the 1 verified Paystack payment (100000 kobo)
  const overviewAfter = (
    await send("GET", "/admin/overview", undefined, adminCookie)
  ).json();
  assert.equal(overviewAfter.metrics.verifiedRevenueKobo, 100000);
  assert.equal(overviewAfter.metrics.paidMemberships, 1);
});

test("admin can revoke access and suspend/reactivate reader accounts", async () => {
  const revokeRes = await send(
    "POST",
    `/admin/users/${guestId}/revoke-access`,
    { reason: "End of test access" },
    adminCookie,
  );
  assert.equal(revokeRes.statusCode, 200);
  assert.equal(revokeRes.json().subscription.active, false);
  assert.equal(revokeRes.json().subscription.effectiveStatus, "revoked");

  // Suspend guest account
  const suspendRes = await send(
    "PATCH",
    `/admin/users/${guestId}/status`,
    { status: "suspended", reason: "Policy test" },
    adminCookie,
  );
  assert.equal(suspendRes.statusCode, 200);

  // Guest session is immediately invalidated
  assert.equal(
    (await send("GET", "/me/dashboard", undefined, guestCookie)).statusCode,
    401,
  );

  // Reactivate guest account
  const reactivateRes = await send(
    "PATCH",
    `/admin/users/${guestId}/status`,
    { status: "active" },
    adminCookie,
  );
  assert.equal(reactivateRes.statusCode, 200);
});

test("unsafe browser requests require origin and anti-CSRF header", async () => {
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        payload: {},
        headers: { cookie: subscriberCookie },
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
          cookie: subscriberCookie,
          origin: "https://evil.example",
          "x-requested-with": "BalancedLife",
        },
      })
    ).statusCode,
    403,
  );
});
