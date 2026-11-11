import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { addMonths } from "../src/services/subscriptions.js";
import {
  addCalendarMonths,
  computeDigitalTermWindow,
} from "../src/services/commerce.js";
import { openDatabase } from "../src/db.js";
import { hashPassword } from "../src/auth.js";
import { users } from "../src/schema.js";
import type {
  PaymentInitializeInput,
  PaymentProvider,
} from "../src/services/payments.js";
import type {
  EmailService,
  OrderAccessEmailInput,
  PasswordResetEmailInput,
} from "../src/services/email.js";
import {
  runNotificationWorkerCycle,
  type PushMessagePayload,
  type WebPushProvider,
  type WebPushSendResult,
  type WebPushSubscriptionTarget,
} from "../src/services/notifications.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

class MockPaystackProvider implements PaymentProvider {
  readonly name = "paystack" as const;
  readonly configured = true;
  readonly publicKey = "pk_test_mock";
  public initialized = new Map<string, number>();
  public forceFailedReferences = new Set<string>();

  async initializeTransaction(input: PaymentInitializeInput) {
    this.initialized.set(input.reference, input.amountKobo);
    return {
      reference: input.reference,
      authorizationUrl: `https://checkout.paystack.com/${input.reference}`,
    };
  }

  async verifyTransaction(reference: string) {
    const amountKobo = this.initialized.get(reference) || 100000;
    if (this.forceFailedReferences.has(reference)) {
      return {
        reference,
        status: "failed" as const,
        amountKobo,
        currency: "NGN",
        providerTransactionId: "ps_failed_" + reference,
        paidAt: null,
      };
    }
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
  public sentOrderLinks: OrderAccessEmailInput[] = [];

  async sendPasswordReset(input: PasswordResetEmailInput) {
    this.sent.push(input);
  }

  async sendOrderAccessLink(input: OrderAccessEmailInput) {
    this.sentOrderLinks.push(input);
  }
}

class MockWebPushProvider implements WebPushProvider {
  readonly configured = true;
  readonly publicKey =
    "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
  public deliveries: Array<{
    endpoint: string;
    payload: PushMessagePayload;
  }> = [];
  public expiredEndpoints = new Set<string>();
  public transientFailureEndpoints = new Set<string>();

  async sendNotification(
    subscription: WebPushSubscriptionTarget,
    payload: PushMessagePayload,
  ): Promise<WebPushSendResult> {
    if (this.expiredEndpoints.has(subscription.endpoint)) {
      return {
        ok: false,
        statusCode: 410,
        expired: true,
        errorMessage: "Push subscription has unsubscribed or expired (410).",
      };
    }
    if (this.transientFailureEndpoints.has(subscription.endpoint)) {
      return {
        ok: false,
        statusCode: 503,
        expired: false,
        errorMessage: "Temporary push gateway error (503).",
      };
    }
    this.deliveries.push({
      endpoint: subscription.endpoint,
      payload,
    });
    return {
      ok: true,
      statusCode: 201,
      expired: false,
    };
  }
}

let folder = "";
let databasePath = "";
let app: Awaited<ReturnType<typeof buildApp>>;
let paystackProvider: MockPaystackProvider;
let emailService: MockEmailService;
let pushProvider: MockWebPushProvider;
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
  pushProvider = new MockWebPushProvider();
  app = await buildApp({
    databasePath,
    paymentProvider: paystackProvider,
    emailService,
    pushProvider,
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

test("complimentary access never counts as verified revenue; retired recurring checkout returns 410 and complimentary grants preserve access", async () => {
  // Before any paid checkout, subscriber has complimentary access; verified revenue must be 0
  const overviewBefore = (
    await send("GET", "/admin/overview", undefined, adminCookie)
  ).json();
  assert.equal(overviewBefore.metrics.verifiedRevenueKobo, 0);
  assert.equal(overviewBefore.metrics.complimentaryMemberships, 1);

  // Retired recurring subscription checkout must return 410
  const initRes = await send(
    "POST",
    "/subscriptions/checkout",
    { planId: 1, renewalMode: "automatic" },
    guestCookie,
  );
  assert.equal(initRes.statusCode, 410);

  // Grant complimentary access to guest so cancellation and revocation can be verified
  const grantGuest = await send(
    "POST",
    `/admin/users/${guestId}/complimentary`,
    { planId: 1, reason: "Complimentary test pass" },
    adminCookie,
  );
  assert.equal(grantGuest.statusCode, 200);
  const expiry = grantGuest.json().subscription.expiresAt;
  assert.equal(grantGuest.json().subscription.accessType, "complimentary");

  // Cancel renewal preserves active-through access
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
  assert.equal(state.payments.length, 0);

  // Complimentary grants still report 0 verified revenue
  const overviewAfter = (
    await send("GET", "/admin/overview", undefined, adminCookie)
  ).json();
  assert.equal(overviewAfter.metrics.verifiedRevenueKobo, 0);
  assert.equal(overviewAfter.metrics.complimentaryMemberships, 2);
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

test("owner brand settings, book prices, and young reader registration consent work as specified", async () => {
  const pubCfg = (await send("GET", "/config")).json();
  assert.equal(
    pubCfg.settings.organizationName,
    "Cossy Teens Consult Enterprises",
  );
  assert.equal(pubCfg.settings.hardcoverPriceKobo, 500000);
  assert.equal(pubCfg.settings.digitalEditionPriceKobo, 350000);
  assert.equal(pubCfg.settings.contactEmail, "cossyteensconsult@gmail.com");
  assert.equal(pubCfg.settings.bankTransferEnabled, false);
  assert.equal(pubCfg.settings.bankAccounts.length, 0);

  // Admin settings contain the 3 Access Bank accounts from the PDF
  const adminSettings = (
    await send("GET", "/admin/settings", undefined, adminCookie)
  ).json();
  assert.equal(adminSettings.bankAccounts.length, 3);
  assert.equal(adminSettings.bankAccounts[0].accountNumber, "1996043204");

  // Teen reader (13-17) without guardian consent must be rejected
  assert.equal(
    (
      await send("POST", "/auth/register", {
        name: "Teen Reader",
        email: "teen-no-consent@example.org",
        password: "Teen-Reader-Pass-2027!",
        ageGroup: "13_17",
        guardianConsentConfirmed: false,
      })
    ).statusCode,
    400,
  );

  // Teen reader (13-17) with guardian consent succeeds
  const teenReg = await send("POST", "/auth/register", {
    name: "Teen Reader",
    email: "teen@example.org",
    password: "Teen-Reader-Pass-2027!",
    ageGroup: "13_17",
    guardianConsentConfirmed: true,
  });
  assert.equal(teenReg.statusCode, 200);
  assert.equal(teenReg.json().user.ageGroup, "13_17");
  assert.equal(teenReg.json().user.guardianConsentConfirmed, true);
});

test("5-step accountability check-in stores lessonLearned, reflection, actionStep, and completion", async () => {
  const devList = (await send("GET", "/devotionals")).json();
  const entryId = devList[0].id;

  const created = await send(
    "POST",
    "/me/journal",
    {
      devotionalId: entryId,
      title: "Jan 1 Check-In",
      lessonLearned: "Stay rooted in Christ daily",
      body: "I noticed how intentional prayer steadies my decisions.",
      actionStep: "Read John 15 before checking my phone tomorrow morning.",
      prayerFocus: "Consistency and humility",
      completed: true,
    },
    subscriberCookie,
  );
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().lessonLearned, "Stay rooted in Christ daily");
  assert.equal(
    created.json().actionStep,
    "Read John 15 before checking my phone tomorrow morning.",
  );

  // Reading the devotional returns the user's accountabilityEntry and completed=true
  const devDetail = (
    await send("GET", `/devotionals/${entryId}`, undefined, subscriberCookie)
  ).json();
  assert.equal(devDetail.completed, true);
  assert.equal(
    devDetail.accountabilityEntry.lessonLearned,
    "Stay rooted in Christ daily",
  );

  // Another user never sees this accountabilityEntry
  const otherReg = await send("POST", "/auth/register", {
    name: "Other Reader",
    email: "other-reader@example.org",
    password: "Other-Reader-Pass-2027!",
  });
  const otherCookie = String(otherReg.headers["set-cookie"]).split(";")[0];
  const sampleId = devList.find((d: { sample: boolean }) => d.sample).id;
  const sampleDetail = (
    await send("GET", `/devotionals/${sampleId}`, undefined, otherCookie)
  ).json();
  assert.equal(sampleDetail.accountabilityEntry, null);
});

test("dedicated Digital Edition purchase (Paystack + webhook + failed verification + bank transfer reconciliation) grants persistent 2027 access", async () => {
  const buyerReg = await send("POST", "/auth/register", {
    name: "Digital Buyer",
    email: "digital-buyer@example.org",
    password: "Digital-Buyer-Pass-2027!",
  });
  assert.equal(buyerReg.statusCode, 200);
  const buyerCookie = String(buyerReg.headers["set-cookie"]).split(";")[0];

  // Before purchase, non-sample devotional is locked (403)
  const devList = (await send("GET", "/devotionals")).json();
  const lockedEntry = devList.find((d: { sample: boolean }) => !d.sample);
  assert.equal(
    (
      await send(
        "GET",
        `/devotionals/${lockedEntry.id}`,
        undefined,
        buyerCookie,
      )
    ).statusCode,
    403,
  );

  // 1. Failed Paystack verification must NOT activate entitlement
  const failedInit = await send(
    "POST",
    "/digital-purchases/checkout",
    { paymentMethod: "paystack" },
    buyerCookie,
  );
  assert.equal(failedInit.statusCode, 200);
  const failedRef = failedInit.json().reference;
  assert.ok(failedRef.startsWith("BLD_DIG_"));
  paystackProvider.forceFailedReferences.add(failedRef);

  const failedVerify = await send(
    "POST",
    "/digital-purchases/verify",
    { reference: failedRef },
    buyerCookie,
  );
  assert.equal(failedVerify.statusCode, 400);
  assert.equal(
    (await send("GET", "/me/digital-edition", undefined, buyerCookie)).json()
      .active,
    false,
  );

  // 2. Successful Paystack checkout + webhook idempotency
  const initRes = await send(
    "POST",
    "/digital-purchases/checkout",
    { paymentMethod: "paystack" },
    buyerCookie,
  );
  assert.equal(initRes.statusCode, 200);
  const reference = initRes.json().reference;

  // Trigger Paystack webhook first
  const webhookRes = await app.inject({
    method: "POST",
    url: "/api/v1/webhooks/paystack",
    payload: {
      event: "charge.success",
      data: { reference },
    },
    headers: { "x-paystack-signature": "valid_mock_sig" },
  });
  assert.equal(webhookRes.statusCode, 200);
  assert.equal(webhookRes.json().processed, true);

  // Replaying verify after webhook is idempotent and does not duplicate revenue
  const verifyRes = await send(
    "POST",
    "/digital-purchases/verify",
    { reference },
    buyerCookie,
  );
  assert.equal(verifyRes.statusCode, 200);
  assert.equal(verifyRes.json().replayed, true);
  // Pre-2027 purchase starts 2027-01-01 and MUST NOT be active prematurely before start date
  assert.equal(verifyRes.json().entitlement.status, "scheduled");
  assert.equal(verifyRes.json().entitlement.active, false);
  assert.equal(verifyRes.json().entitlement.startsAt, "2027-01-01T00:00:00.000Z");
  assert.equal(verifyRes.json().entitlement.editionYear, 2027);

  // Premature digital access BEFORE start date is blocked (403)
  const prematureRes = await send(
    "GET",
    `/devotionals/${lockedEntry.id}`,
    undefined,
    buyerCookie,
  );
  assert.equal(prematureRes.statusCode, 403);

  // Overview revenue equals the 350,000 kobo verified digital purchase immediately upon settlement
  const overview = (
    await send("GET", "/admin/overview", undefined, adminCookie)
  ).json();
  assert.equal(overview.metrics.digitalRevenueKobo, 350000);
  assert.equal(overview.metrics.verifiedRevenueKobo, 350000);
  assert.equal(overview.metrics.digitalEditionsSold, 1);

  // Simulate entitlement reaching its active start window -> premium reading unlocks
  const buyerUserId = buyerReg.json().user.id;
  const dbActivate = openDatabase(databasePath);
  try {
    dbActivate.sqlite
      .prepare(
        `UPDATE digital_entitlements SET starts_at = '2026-01-01T00:00:00.000Z' WHERE user_id = ?`,
      )
      .run(buyerUserId);
  } finally {
    dbActivate.sqlite.close();
  }

  const unlockedRes = await send(
    "GET",
    `/devotionals/${lockedEntry.id}`,
    undefined,
    buyerCookie,
  );
  assert.equal(unlockedRes.statusCode, 200);
  assert.equal(unlockedRes.json().reflection, entryFixture.reflection);

  // 3. Bank-transfer workflow when enabled by admin
  const transferBuyerReg = await send("POST", "/auth/register", {
    name: "Transfer Buyer",
    email: "transfer-buyer@example.org",
    password: "Transfer-Buyer-Pass-2027!",
  });
  const transferCookie = String(transferBuyerReg.headers["set-cookie"]).split(
    ";",
  )[0];

  // While bankTransferEnabled is false, bank_transfer checkout is rejected
  assert.equal(
    (
      await send(
        "POST",
        "/digital-purchases/checkout",
        { paymentMethod: "bank_transfer" },
        transferCookie,
      )
    ).statusCode,
    503,
  );

  // Enable bankTransferEnabled in admin settings
  const currentSettings = (
    await send("GET", "/admin/settings", undefined, adminCookie)
  ).json();
  const enableRes = await send(
    "PUT",
    "/admin/settings",
    { ...currentSettings, bankTransferEnabled: true },
    adminCookie,
  );
  assert.equal(enableRes.statusCode, 200);

  const btOrder = await send(
    "POST",
    "/digital-purchases/checkout",
    {
      paymentMethod: "bank_transfer",
      currency: "NGN",
      payerNote: "Transfer from Access Bank",
    },
    transferCookie,
  );
  assert.equal(btOrder.statusCode, 200);
  const purchaseId = btOrder.json().purchase.id;

  // Submitting transfer proof moves status to verifying_transfer and NEVER auto-activates access
  const proofRes = await send(
    "POST",
    `/digital-purchases/${purchaseId}/transfer-proof`,
    {
      transferReference: "NIP-SESSION-99887766",
      payerNote: "Paid NGN 3,500",
    },
    transferCookie,
  );
  assert.equal(proofRes.statusCode, 200);
  assert.equal(proofRes.json().purchase.status, "verifying_transfer");
  assert.equal(
    (await send("GET", "/me/digital-edition", undefined, transferCookie)).json()
      .active,
    false,
  );

  // Admin reconciliation approves purchase (scheduled starting 2027-01-01 when purchased pre-2027)
  const approveRes = await send(
    "POST",
    `/admin/digital-purchases/${purchaseId}/reconcile`,
    { action: "approve", adminNotes: "Confirmed on Access Bank statement" },
    adminCookie,
  );
  assert.equal(approveRes.statusCode, 200);
  assert.equal(approveRes.json().status, "succeeded");
  const transferDigitalState = (
    await send("GET", "/me/digital-edition", undefined, transferCookie)
  ).json();
  assert.equal(transferDigitalState.entitlement.status, "scheduled");
  assert.equal(transferDigitalState.active, false);

  // Double-approve and invalid reject after settlement are blocked (400)
  const doubleApprove = await send(
    "POST",
    `/admin/digital-purchases/${purchaseId}/reconcile`,
    { action: "approve", adminNotes: "Accidental duplicate click" },
    adminCookie,
  );
  assert.equal(doubleApprove.statusCode, 400);
  const badReject = await send(
    "POST",
    `/admin/digital-purchases/${purchaseId}/reconcile`,
    { action: "reject", adminNotes: "Should not reject settled purchase" },
    adminCookie,
  );
  assert.equal(badReject.statusCode, 400);
});

test("bulk-order workflow stores null discount by default and supports admin quotation, discount, and fulfillment", async () => {
  const created = await send("POST", "/bulk-orders", {
    contactName: "Pastor Samuel Adeyemi",
    organizationName: "Grace Youth Fellowship",
    organizationType: "church",
    email: "youth@gracechurch.org",
    phone: "+2348030001122",
    quantity: 50,
    preferredFormat: "printed",
    deliveryLocation: "Ikeja, Lagos",
    notes: "For our annual youth camp in August.",
  });
  assert.equal(created.statusCode, 200);
  const bulkId = created.json().id;
  assert.equal(created.json().discountPercent, null);
  assert.equal(created.json().quotedTotalKobo, null);

  const patched = await send(
    "PATCH",
    `/admin/bulk-orders/${bulkId}`,
    {
      status: "quoted",
      unitPriceKobo: 500000,
      discountPercent: 10,
      quotedTotalKobo: 22500000,
      adminNotes: "Approved 10% church youth camp discount.",
    },
    adminCookie,
  );
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.json().status, "quoted");
  assert.equal(patched.json().discountPercent, 10);
  assert.equal(patched.json().quotedTotalKobo, 22500000);
});

test("Web Push subscriptions, background scheduler, timezone/quiet-hours/access guards, expired 410 cleanup, and concurrent worker deduplication work reliably", async () => {
  const initNotifs = (
    await send("GET", "/me/notifications", undefined, subscriberCookie)
  ).json();
  assert.equal(initNotifs.preferences.notificationsEnabled, true);
  assert.equal(initNotifs.preferences.dailyReminderEnabled, false);
  assert.equal(initNotifs.preferences.unreadReminderEnabled, false);
  assert.equal(initNotifs.pushSubscriptionsCount, 0);
  assert.equal(initNotifs.webPush.configured, true);
  assert.ok(initNotifs.webPush.publicKey);
  assert.ok(Array.isArray(initNotifs.supportedTimezones));

  // Enable daily + unread reminders for subscriber (Africa/Lagos, 06:30)
  const prefRes = await send(
    "PATCH",
    "/me/notifications/preferences",
    {
      notificationsEnabled: true,
      dailyReminderEnabled: true,
      unreadReminderEnabled: true,
      reminderTime: "06:30",
      timezone: "Africa/Lagos",
      quietHoursStart: "22:00",
      quietHoursEnd: "05:30",
      subscriptionAlertsEnabled: true,
      purchaseAlertsEnabled: true,
    },
    subscriberCookie,
  );
  assert.equal(prefRes.statusCode, 200);
  assert.equal(prefRes.json().preferences.dailyReminderEnabled, true);
  assert.equal(prefRes.json().preferences.unreadReminderEnabled, true);

  // Also enable daily reminder for guest (whose access was revoked earlier) to verify access guard
  const guestLogin = await send("POST", "/auth/login", {
    email: "alex@example.org",
    password: "Brand-New-Password-2027!",
  });
  assert.equal(guestLogin.statusCode, 200);
  guestCookie = String(guestLogin.headers["set-cookie"]).split(";")[0];

  await send(
    "PATCH",
    "/me/notifications/preferences",
    {
      notificationsEnabled: true,
      dailyReminderEnabled: true,
      unreadReminderEnabled: true,
      reminderTime: "06:30",
      timezone: "Africa/Lagos",
      quietHoursStart: "22:00",
      quietHoursEnd: "05:30",
      subscriptionAlertsEnabled: true,
      purchaseAlertsEnabled: true,
    },
    guestCookie,
  );

  // Register two push devices for subscriber: one active, one that will expire (HTTP 410)
  const validEndpoint = "https://fcm.googleapis.com/fcm/send/mock-endpoint-valid";
  const expiredEndpoint =
    "https://fcm.googleapis.com/fcm/send/mock-endpoint-expired-410";

  const subPush1 = await send(
    "POST",
    "/me/notifications/push-subscribe",
    {
      endpoint: validEndpoint,
      p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ",
      auth: "tBHItJI5svbpez7KI4CCXg",
      userAgent: "Playwright Android Chrome",
      deviceLabel: "Android Chrome",
    },
    subscriberCookie,
  );
  assert.equal(subPush1.statusCode, 200);
  assert.equal(subPush1.json().pushSubscriptionsCount, 1);

  const subPush2 = await send(
    "POST",
    "/me/notifications/push-subscribe",
    {
      endpoint: expiredEndpoint,
      p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ",
      auth: "tBHItJI5svbpez7KI4CCXg",
      userAgent: "Old Browser Device",
      deviceLabel: "Stale Browser",
    },
    subscriberCookie,
  );
  assert.equal(subPush2.statusCode, 200);
  assert.equal(subPush2.json().pushSubscriptionsCount, 2);

  // Mark the second endpoint as expired (HTTP 410) in MockWebPushProvider
  pushProvider.expiredEndpoints.add(expiredEndpoint);
  pushProvider.deliveries = [];

  // User-initiated test notification delivers to valid device and cleans up 410 endpoint
  const testPushRes = await send(
    "POST",
    "/me/notifications/test",
    {},
    subscriberCookie,
  );
  assert.equal(testPushRes.statusCode, 200);
  assert.equal(testPushRes.json().deliveredCount, 1);
  const testDeliveries = pushProvider.deliveries.filter((d) =>
    d.payload.title.includes("Test Notification"),
  );
  assert.equal(testDeliveries.length, 1);
  assert.equal(testDeliveries[0].endpoint, validEndpoint);
  assert.ok(
    !JSON.stringify(testDeliveries[0].payload).includes(
      "PRIVATE JOURNAL",
    ),
  );

  // Expired 410 endpoint is now deactivated; active count is 1
  const after410 = (
    await send("GET", "/me/notifications", undefined, subscriberCookie)
  ).json();
  assert.equal(after410.pushSubscriptionsCount, 1);

  // Unmark progress on 2027-01-01 (non-sample) so subscriber is eligible for reminder
  const devList = (await send("GET", "/devotionals")).json();
  const jan1Entry = devList.find((d: { date: string }) => d.date === "2027-01-01");
  await send(
    "POST",
    `/me/progress/${jan1Entry.id}`,
    { completed: false },
    subscriberCookie,
  );

  // Calling GET /me/notifications does NOT evaluate or create reminders as a side effect
  const fetchBeforeWorker = (
    await send("GET", "/me/notifications", undefined, subscriberCookie)
  ).json();
  assert.equal(
    fetchBeforeWorker.events.filter(
      (e: { category: string }) => e.category === "daily_reminder",
    ).length,
    0,
  );

  const workerStore = openDatabase(databasePath);
  try {
    pushProvider.deliveries = [];

    // 1. Pre-2027 guard: running worker on 2026-12-31T08:00:00Z must NOT send 2027 daily devotional reminders
    const pre2027Run = await runNotificationWorkerCycle(
      workerStore,
      pushProvider,
      new Date("2026-12-31T08:00:00.000Z"),
    );
    assert.equal(pre2027Run.createdEvents, 0);

    // 2. Timezone & reminderTime guard: at 2027-01-01T05:00:00Z, Africa/Lagos is 06:00 (< 06:30 reminderTime)
    const earlyRun = await runNotificationWorkerCycle(
      workerStore,
      pushProvider,
      new Date("2027-01-01T05:00:00.000Z"),
    );
    assert.equal(earlyRun.createdEvents, 0);

    // 3. Simultaneous worker runs at 2027-01-01T05:30:00Z (06:30 Africa/Lagos):
    //    - Subscriber (entitled) gets exactly 1 daily_reminder event and 1 Web Push delivery.
    //    - Guest (revoked access, non-sample entry) gets 0 daily_reminder events.
    const [runA, runB] = await Promise.all([
      runNotificationWorkerCycle(
        workerStore,
        pushProvider,
        new Date("2027-01-01T05:30:00.000Z"),
      ),
      runNotificationWorkerCycle(
        workerStore,
        pushProvider,
        new Date("2027-01-01T05:30:00.000Z"),
      ),
    ]);
    assert.equal(runA.createdEvents + runB.createdEvents, 1);
    assert.equal(pushProvider.deliveries.length, 1);
    assert.match(pushProvider.deliveries[0].payload.title, /Daily Devotional/);

    const guestNotifs = (
      await send("GET", "/me/notifications", undefined, guestCookie)
    ).json();
    assert.equal(
      guestNotifs.events.filter(
        (e: { category: string }) => e.category === "daily_reminder",
      ).length,
      0,
    );

    // 4. Evening unread devotional reminder at 2027-01-01T17:30:00Z (18:30 Africa/Lagos) while reading is still incomplete
    pushProvider.deliveries = [];
    const eveningRun = await runNotificationWorkerCycle(
      workerStore,
      pushProvider,
      new Date("2027-01-01T17:30:00.000Z"),
    );
    assert.equal(eveningRun.createdEvents, 1);
    assert.equal(pushProvider.deliveries.length, 1);
    assert.match(pushProvider.deliveries[0].payload.title, /Unread Today:/);

    // 5. Complete 2027-01-02 reading for subscriber before 06:30 on Jan 2 ->
    //    subscriber (completed) receives 0 reminders & 0 push deliveries for Jan 2,
    //    while guest (uncompleted, and Jan 2 is sample=true) receives 1 daily_reminder event.
    const jan2Entry = devList.find((d: { date: string }) => d.date === "2027-01-02");
    await send(
      "POST",
      `/me/progress/${jan2Entry.id}`,
      { completed: true },
      subscriberCookie,
    );
    pushProvider.deliveries = [];
    const jan2Run = await runNotificationWorkerCycle(
      workerStore,
      pushProvider,
      new Date("2027-01-02T06:00:00.000Z"),
    );
    assert.equal(
      jan2Run.generatedKeys.includes(`daily_reminder_${subscriberId}_2027-01-02`),
      false,
    );
    assert.equal(
      jan2Run.generatedKeys.includes(`daily_reminder_${guestId}_2027-01-02`),
      true,
    );
    assert.equal(pushProvider.deliveries.length, 0);

    // 6. Master opt-out (notificationsEnabled = false) prevents test notifications and future reminders
    await send(
      "PATCH",
      "/me/notifications/preferences",
      {
        notificationsEnabled: false,
        dailyReminderEnabled: true,
        unreadReminderEnabled: true,
        reminderTime: "06:30",
        timezone: "Africa/Lagos",
        quietHoursStart: "22:00",
        quietHoursEnd: "05:30",
        subscriptionAlertsEnabled: true,
        purchaseAlertsEnabled: true,
      },
      subscriberCookie,
    );
    assert.equal(
      (await send("POST", "/me/notifications/test", {}, subscriberCookie))
        .statusCode,
      400,
    );
  } finally {
    workerStore.sqlite.close();
  }
});

test("Product A: 12-month calendar calculation, pre-2027 start anchor, manual renewal extension, and expiration gating while preserving user progress/journals", async () => {
  // 1. Calendar calculation tests
  const pre2027Date = new Date("2026-11-08T12:00:00.000Z");
  const earlyWindow = computeDigitalTermWindow(pre2027Date, null, 12);
  assert.equal(earlyWindow.startsAt, "2027-01-01T00:00:00.000Z");
  assert.equal(earlyWindow.expiresAt, "2028-01-01T00:00:00.000Z");

  const mid2027Date = new Date("2027-06-15T10:00:00.000Z");
  const midWindow = computeDigitalTermWindow(mid2027Date, null, 12);
  assert.equal(midWindow.startsAt, "2027-06-15T10:00:00.000Z");
  assert.equal(midWindow.expiresAt, "2028-06-15T10:00:00.000Z");

  // Renewal extends from existing expiration if active
  const renewalWindow = computeDigitalTermWindow(
    new Date("2027-10-01T10:00:00.000Z"),
    {
      status: "active",
      startsAt: "2027-06-15T10:00:00.000Z",
      expiresAt: "2028-06-15T10:00:00.000Z",
    },
    12,
  );
  assert.equal(renewalWindow.startsAt, "2027-06-15T10:00:00.000Z");
  assert.equal(renewalWindow.expiresAt, "2029-06-15T10:00:00.000Z");

  // Month-end clamping
  assert.equal(
    addCalendarMonths("2027-01-31T00:00:00.000Z", 1),
    "2027-02-28T00:00:00.000Z",
  );
  assert.equal(
    addCalendarMonths("2028-01-31T00:00:00.000Z", 1),
    "2028-02-29T00:00:00.000Z",
  );

  // 2. Reader buys 12-month access
  const termReaderReg = await send("POST", "/auth/register", {
    name: "Term Reader",
    email: "term-reader@example.org",
    password: "Term-Reader-Pass-2027!",
  });
  assert.equal(termReaderReg.statusCode, 200);
  const termCookie = String(termReaderReg.headers["set-cookie"]).split(";")[0];
  const termUserId = termReaderReg.json().user.id;

  const checkoutRes = await send(
    "POST",
    "/digital-purchases/checkout",
    { paymentMethod: "paystack", currency: "NGN" },
    termCookie,
  );
  assert.equal(checkoutRes.statusCode, 200);
  const ref = checkoutRes.json().reference;

  const verifyRes = await send(
    "POST",
    "/digital-purchases/verify",
    { reference: ref },
    termCookie,
  );
  assert.equal(verifyRes.statusCode, 200);
  const ent = verifyRes.json().entitlement;
  assert.equal(ent.status, "scheduled");
  assert.equal(ent.active, false);
  assert.equal(ent.startsAt, "2027-01-01T00:00:00.000Z");
  assert.equal(ent.expiresAt, "2028-01-01T00:00:00.000Z");
  assert.equal(ent.durationMonths, 12);

  // Reader creates journal reflections, progress, and bookmarks once inside active window
  const devList = (await send("GET", "/devotionals")).json();
  const sampleEntry = devList.find((d: { sample: boolean }) => d.sample);
  const lockedEntry = devList.find((d: { sample: boolean }) => !d.sample);

  // Premature digital access BEFORE start date MUST fail across ALL premium reading endpoints (403)
  assert.equal(
    (
      await send(
        "GET",
        `/devotionals/${lockedEntry.id}`,
        undefined,
        termCookie,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await send(
        "POST",
        `/me/progress/${lockedEntry.id}`,
        { completed: true },
        termCookie,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await send(
        "POST",
        `/me/bookmarks/${lockedEntry.id}`,
        { saved: true },
        termCookie,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await send(
        "POST",
        "/me/journal",
        {
          devotionalId: lockedEntry.id,
          title: "Blocked Premature Reflection",
          body: "Should not attach to locked devotional before start date.",
        },
        termCookie,
      )
    ).statusCode,
    403,
  );

  // Simulate reaching the active entitlement period (starts_at <= now < expires_at)
  const dbStart = openDatabase(databasePath);
  try {
    dbStart.sqlite
      .prepare(
        `UPDATE digital_entitlements
         SET starts_at = '2026-01-01T00:00:00.000Z'
         WHERE user_id = ?`,
      )
      .run(termUserId);
  } finally {
    dbStart.sqlite.close();
  }

  await send(
    "POST",
    `/me/progress/${lockedEntry.id}`,
    { completed: true },
    termCookie,
  );
  await send(
    "POST",
    `/me/bookmarks/${lockedEntry.id}`,
    { saved: true },
    termCookie,
  );
  const journalRes = await send(
    "POST",
    "/me/journal",
    {
      devotionalId: lockedEntry.id,
      title: "My 12-Month Reflection",
      body: "Saved during my active 12-month access.",
      completed: true,
    },
    termCookie,
  );
  assert.equal(journalRes.statusCode, 200);

  // Can read locked entry while access is active
  const readActive = await send(
    "GET",
    `/devotionals/${lockedEntry.id}`,
    undefined,
    termCookie,
  );
  assert.equal(readActive.statusCode, 200);

  // 3. Simulate access expiring (manually adjust expiresAt to the past in SQLite)
  const db = openDatabase(databasePath);
  try {
    db.sqlite
      .prepare(
        `UPDATE digital_entitlements
         SET expires_at = '2026-01-01T00:00:00.000Z',
             starts_at = '2025-01-01T00:00:00.000Z',
             status = 'expired'
         WHERE user_id = ?`,
      )
      .run(termUserId);
  } finally {
    db.sqlite.close();
  }

  // Attempting to read locked non-sample devotional now returns 403
  const readExpired = await send(
    "GET",
    `/devotionals/${lockedEntry.id}`,
    undefined,
    termCookie,
  );
  assert.equal(readExpired.statusCode, 403);
  assert.match(readExpired.json().message, /active membership or 2027 Digital Edition purchase/);

  // But free sample reading remains accessible!
  const readSample = await send(
    "GET",
    `/devotionals/${sampleEntry.id}`,
    undefined,
    termCookie,
  );
  assert.equal(readSample.statusCode, 200);

  // Reader account, progress, bookmarks, and private journals remain completely preserved and accessible!
  const progRes = await send("GET", "/me/progress", undefined, termCookie);
  assert.equal(progRes.statusCode, 200);
  assert.equal(progRes.json().totalCompleted, 1);

  const bmRes = await send("GET", "/me/bookmarks", undefined, termCookie);
  assert.equal(bmRes.statusCode, 200);
  assert.equal(bmRes.json().length, 1);

  const jRes = await send("GET", "/me/journal", undefined, termCookie);
  assert.equal(jRes.statusCode, 200);
  assert.equal(jRes.json().length, 1);
  assert.equal(jRes.json()[0].title, "My 12-Month Reflection");

  // 4. Reader manually renews 12-month access -> renewal extends to 2028-01-01!
  const renewCheckout = await send(
    "POST",
    "/digital-purchases/checkout",
    { paymentMethod: "paystack", currency: "NGN" },
    termCookie,
  );
  assert.equal(renewCheckout.statusCode, 200);
  const renewRef = renewCheckout.json().reference;

  const renewVerify = await send(
    "POST",
    "/digital-purchases/verify",
    { reference: renewRef },
    termCookie,
  );
  assert.equal(renewVerify.statusCode, 200);
  assert.equal(renewVerify.json().entitlement.renewalCount, 1);

  // Simulate active window starting for the renewed term -> access restored!
  const dbRestore = openDatabase(databasePath);
  try {
    dbRestore.sqlite
      .prepare(
        `UPDATE digital_entitlements
         SET starts_at = '2026-01-01T00:00:00.000Z'
         WHERE user_id = ?`,
      )
      .run(termUserId);
  } finally {
    dbRestore.sqlite.close();
  }

  // Access to locked entry is restored!
  const readRestored = await send(
    "GET",
    `/devotionals/${lockedEntry.id}`,
    undefined,
    termCookie,
  );
  assert.equal(readRestored.statusCode, 200);
});

test("Product A: Preserving legacy persistent entitlements so existing paying customers never silently lose rights", async () => {
  const legacyReaderReg = await send("POST", "/auth/register", {
    name: "Legacy Entitlement Reader",
    email: "legacy-reader@example.org",
    password: "Legacy-Reader-Pass-2027!",
  });
  assert.equal(legacyReaderReg.statusCode, 200);
  const legacyCookie = String(legacyReaderReg.headers["set-cookie"]).split(";")[0];
  const legacyUserId = legacyReaderReg.json().user.id;

  // Insert a preserved legacy row (legacy_persistent = 1, legacy_review_required = 1)
  const now = new Date().toISOString();
  const db = openDatabase(databasePath);
  try {
    db.sqlite
      .prepare(
        `INSERT INTO digital_entitlements (
          user_id, edition_year, access_type, access_scope, status,
          starts_at, expires_at, duration_months, renewal_count,
          legacy_persistent, legacy_review_required, grant_reason,
          granted_at, updated_at
        ) VALUES (
          ?, 2027, 'paid', 'edition_2027', 'active',
          '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 12, 0,
          1, 1, 'Preserved legacy persistent entitlement from pre-business-model migration',
          ?, ?
        )`,
      )
      .run(legacyUserId, now, now);
  } finally {
    db.sqlite.close();
  }

  // Legacy persistent entitlement reader STILL has active access despite past expires_at!
  const devList = (await send("GET", "/devotionals")).json();
  const lockedEntry = devList.find((d: { sample: boolean }) => !d.sample);
  const readRes = await send(
    "GET",
    `/devotionals/${lockedEntry.id}`,
    undefined,
    legacyCookie,
  );
  assert.equal(readRes.statusCode, 200);

  // Admin overview flags legacy persistent entitlement for review
  const adminOverview = (
    await send("GET", "/admin/overview", undefined, adminCookie)
  ).json();
  const userRecord = adminOverview.users.find(
    (u: { id: number }) => u.id === legacyUserId,
  );
  assert.equal(userRecord.digitalEntitlement.legacyPersistent, true);
  assert.equal(userRecord.digitalEntitlement.legacyReviewRequired, true);

  const alertFound = adminOverview.operationalAlerts.some(
    (al: { category: string; description: string }) =>
      al.category === "online_access" &&
      al.description.includes("legacy-reader@example.org"),
  );
  assert.equal(alertFound, true);
});

test("Product B: Printed Book orders, quantity & subtotal math, quotation approval, unpaid dispatch guard, and fulfillment lifecycle", async () => {
  // 0. Default inventory is explicitly unconfigured (null), never assumed 500
  const cfgBefore = (await send("GET", "/config")).json();
  assert.equal(cfgBefore.settings.printedBookStockCount, null);

  // 1. Customer creates printed order with full delivery information
  const createRes = await send("POST", "/printed-orders", {
    fullName: "Chinedu Okafor",
    email: "chinedu@example.org",
    phone: "+2348021112233",
    streetAddress: "14 Awolowo Way, Ikeja",
    city: "Ikeja",
    state: "Lagos",
    country: "Nigeria",
    deliveryLandmark: "Beside General Hospital",
    quantity: 2,
    customerDeliveryNotes: "Please deliver between 9am and 2pm on weekdays.",
  });
  assert.equal(createRes.statusCode, 200);
  const order = createRes.json();
  assert.ok(order.orderNumber.startsWith("BLD-PRT-"));
  assert.ok(order.orderAccessToken && order.orderAccessToken.length >= 32);
  assert.equal(order.quantity, 2);
  assert.equal(order.unitPriceKobo, 500000); // ₦5,000 per copy
  assert.equal(order.subtotalKobo, 1000000); // ₦10,000
  assert.equal(order.deliveryFeeKobo, null); // Uninvented: null until quoted
  assert.equal(order.deliveryQuoteStatus, "pending_quote");
  assert.equal(order.finalTotalKobo, null);
  assert.equal(order.paymentStatus, "pending");
  assert.equal(order.fulfillmentStatus, "awaiting_delivery_quotation");

  // SECURITY: Email-only lookup MUST be rejected (403) without token or authenticated ownership
  const unauthLookup = await send(
    "GET",
    `/printed-orders/lookup?orderNumber=${order.orderNumber}&email=chinedu@example.org`,
  );
  assert.equal(unauthLookup.statusCode, 403);

  // SECURITY: Wrong token MUST be rejected (403)
  const badTokenLookup = await send(
    "GET",
    `/printed-orders/lookup?orderNumber=${order.orderNumber}&token=invalid_token_12345`,
  );
  assert.equal(badTokenLookup.statusCode, 403);

  // SECURITY: Registering an unverified user with the guest's email MUST NOT grant access via cookie or /me/printed-orders
  const imposterReg = await send("POST", "/auth/register", {
    name: "Imposter Account",
    email: "chinedu@example.org",
    password: "Imposter-Password-2027!",
  });
  assert.equal(imposterReg.statusCode, 200);
  const imposterCookie = String(imposterReg.headers["set-cookie"]).split(";")[0];
  assert.equal(
    (await send("GET", "/me/printed-orders", undefined, imposterCookie)).json()
      .length,
    0,
  );
  assert.equal(
    (
      await send(
        "GET",
        `/printed-orders/lookup?orderNumber=${order.orderNumber}`,
        undefined,
        imposterCookie,
      )
    ).statusCode,
    403,
  );

  // Lookup order with valid issued expiring orderAccessToken succeeds
  const lookupRes = await send(
    "GET",
    `/printed-orders/lookup?orderNumber=${order.orderNumber}&token=${order.orderAccessToken}`,
  );
  assert.equal(lookupRes.statusCode, 200);
  assert.equal(lookupRes.json().id, order.id);
  assert.equal(lookupRes.json().streetAddress, "14 Awolowo Way, Ikeja");

  // Admin cannot mark order paid or awaiting_payment while deliveryFeeKobo is null
  const nullPaidErr = await send(
    "PATCH",
    `/admin/printed-orders/${order.id}`,
    { paymentStatus: "paid" },
    adminCookie,
  );
  assert.equal(nullPaidErr.statusCode, 400);

  // 2. Admin quotes delivery fee of ₦2,500 (250,000 kobo)
  const quoteRes = await send(
    "PATCH",
    `/admin/printed-orders/${order.id}`,
    {
      deliveryFeeKobo: 250000,
    },
    adminCookie,
  );
  assert.equal(quoteRes.statusCode, 200);
  assert.equal(quoteRes.json().deliveryFeeKobo, 250000);
  assert.equal(quoteRes.json().finalTotalKobo, 1250000); // 1,000,000 + 250,000 = ₦12,500
  assert.equal(quoteRes.json().deliveryQuoteStatus, "quoted");

  // Customer CANNOT initiate payment BEFORE approving the final quote (400)
  const preApprovePay = await send(
    "POST",
    `/printed-orders/${order.id}/pay`,
    { paymentMethod: "paystack", orderAccessToken: order.orderAccessToken },
  );
  assert.equal(preApprovePay.statusCode, 400);

  // Unauthorized/imposter user CANNOT approve quotation (403)
  const unauthApprove = await send(
    "POST",
    `/printed-orders/${order.id}/approve-quote`,
    {},
    imposterCookie,
  );
  assert.equal(unauthApprove.statusCode, 403);

  // 3. Customer approves delivery quotation using valid token
  const approveRes = await send(
    "POST",
    `/printed-orders/${order.id}/approve-quote`,
    { orderAccessToken: order.orderAccessToken },
  );
  assert.equal(approveRes.statusCode, 200);
  assert.equal(approveRes.json().deliveryQuoteStatus, "customer_approved");
  assert.equal(approveRes.json().fulfillmentStatus, "awaiting_payment");

  // Revising delivery fee resets customer approval cleanly
  const revisedQuote = await send(
    "PATCH",
    `/admin/printed-orders/${order.id}`,
    { deliveryFeeKobo: 300000 },
    adminCookie,
  );
  assert.equal(revisedQuote.json().deliveryQuoteStatus, "quoted");
  const blockedPayAfterRevision = await send(
    "POST",
    `/printed-orders/${order.id}/pay`,
    { paymentMethod: "paystack", orderAccessToken: order.orderAccessToken },
  );
  assert.equal(blockedPayAfterRevision.statusCode, 400);

  // Restore ₦2,500 fee and customer re-approves
  await send(
    "PATCH",
    `/admin/printed-orders/${order.id}`,
    { deliveryFeeKobo: 250000 },
    adminCookie,
  );
  const reApprove = await send(
    "POST",
    `/printed-orders/${order.id}/approve-quote`,
    { orderAccessToken: order.orderAccessToken },
  );
  assert.equal(reApprove.statusCode, 200);
  assert.equal(reApprove.json().deliveryQuoteStatus, "customer_approved");

  // 4. Unpaid dispatch guard: attempting to mark order ready_for_dispatch, shipped, or delivered while unpaid fails with 400
  const guardRes1 = await send(
    "PATCH",
    `/admin/printed-orders/${order.id}`,
    { fulfillmentStatus: "ready_for_dispatch" },
    adminCookie,
  );
  assert.equal(guardRes1.statusCode, 400);
  assert.match(guardRes1.json().message, /Cannot mark unpaid printed order as ready_for_dispatch/);

  const guardRes2 = await send(
    "PATCH",
    `/admin/printed-orders/${order.id}`,
    { fulfillmentStatus: "shipped" },
    adminCookie,
  );
  assert.equal(guardRes2.statusCode, 400);

  // 5. Unauthorized payment initiation fails (403); authorized initiation succeeds
  const unauthPayInit = await send(
    "POST",
    `/printed-orders/${order.id}/pay`,
    { paymentMethod: "paystack" },
    imposterCookie,
  );
  assert.equal(unauthPayInit.statusCode, 403);

  const payInit = await send(
    "POST",
    `/printed-orders/${order.id}/pay`,
    { paymentMethod: "paystack", orderAccessToken: order.orderAccessToken },
  );
  assert.equal(payInit.statusCode, 200);
  const payRef = payInit.json().reference;
  assert.ok(payRef.startsWith("BLD_PRT_"));

  // Unauthorized verify WITHOUT token or owner auth fails (403)
  const unauthVerify = await send(
    "POST",
    "/printed-orders/verify",
    { reference: payRef },
  );
  assert.equal(unauthVerify.statusCode, 403);

  const verifyPay = await send(
    "POST",
    "/printed-orders/verify",
    { reference: payRef, orderAccessToken: order.orderAccessToken },
  );
  assert.equal(verifyPay.statusCode, 200);
  assert.equal(verifyPay.json().order.paymentStatus, "paid");
  assert.equal(verifyPay.json().order.fulfillmentStatus, "processing");

  // Delivery fee cannot be modified after payment confirmation
  const modifyPaidFee = await send(
    "PATCH",
    `/admin/printed-orders/${order.id}`,
    { deliveryFeeKobo: 500000 },
    adminCookie,
  );
  assert.equal(modifyPaidFee.statusCode, 400);

  // 6. Admin assigns courier, tracking reference, and marks shipped
  const shipRes = await send(
    "PATCH",
    `/admin/printed-orders/${order.id}`,
    {
      fulfillmentStatus: "shipped",
      courierName: "GIG Logistics",
      trackingReference: "GIG-LAG-2027-1092",
    },
    adminCookie,
  );
  assert.equal(shipRes.statusCode, 200);
  assert.equal(shipRes.json().fulfillmentStatus, "shipped");
  assert.equal(shipRes.json().courierName, "GIG Logistics");
  assert.equal(shipRes.json().trackingReference, "GIG-LAG-2027-1092");

  // Mark delivered
  const deliverRes = await send(
    "PATCH",
    `/admin/printed-orders/${order.id}`,
    { fulfillmentStatus: "delivered" },
    adminCookie,
  );
  assert.equal(deliverRes.statusCode, 200);
  assert.equal(deliverRes.json().fulfillmentStatus, "delivered");
  assert.ok(deliverRes.json().deliveredAt);

  // Reverting delivered order back to pending status is rejected (400)
  const revertDelivered = await send(
    "PATCH",
    `/admin/printed-orders/${order.id}`,
    { fulfillmentStatus: "awaiting_payment" },
    adminCookie,
  );
  assert.equal(revertDelivered.statusCode, 400);

  // 7. Verify printed order appears in admin overview and revenue increases accurately
  const adminOverview = (
    await send("GET", "/admin/overview", undefined, adminCookie)
  ).json();
  assert.equal(adminOverview.metrics.deliveredOrders >= 1, true);
  assert.equal(adminOverview.metrics.printedBookRevenueKobo >= 1250000, true);
  assert.ok(adminOverview.metrics.totalSalesKobo >= 1250000);
});

test("Security & Inventory Regression: authenticated printed-order ownership, expired tokens, access link request, bank-transfer verify guard, cancelled transition guard, and confirmed inventory enforcement", async () => {
  // 1. Authenticated reader places an order and accesses it without needing a token
  const buyerReg = await send("POST", "/auth/register", {
    name: "Auth Printed Buyer",
    email: "auth-printed@example.org",
    password: "Auth-Printed-Pass-2027!",
  });
  assert.equal(buyerReg.statusCode, 200);
  const buyerCookie = String(buyerReg.headers["set-cookie"]).split(";")[0];

  // Configure owner-confirmed inventory of 3 copies (and enable bank transfers)
  const settings = (await send("GET", "/admin/settings", undefined, adminCookie)).json();
  const stockSet = await send(
    "PUT",
    "/admin/settings",
    {
      ...settings,
      hardcoverAvailability: "available",
      printedBookStockCount: 3,
      bankTransferEnabled: true,
    },
    adminCookie,
  );
  assert.equal(stockSet.statusCode, 200);
  assert.equal(stockSet.json().printedBookStockCount, 3);

  // Attempting to order 4 copies when only 3 are confirmed in stock fails (400)
  const overStockRes = await send(
    "POST",
    "/printed-orders",
    {
      fullName: "Auth Printed Buyer",
      email: "auth-printed@example.org",
      phone: "+2348099988776",
      streetAddress: "10 Admiralty Way, Lekki",
      city: "Lekki",
      state: "Lagos",
      country: "Nigeria",
      quantity: 4,
    },
    buyerCookie,
  );
  assert.equal(overStockRes.statusCode, 400);

  // Ordering 2 copies succeeds and decrements confirmed stock from 3 -> 1
  const okOrderRes = await send(
    "POST",
    "/printed-orders",
    {
      fullName: "Auth Printed Buyer",
      email: "auth-printed@example.org",
      phone: "+2348099988776",
      streetAddress: "10 Admiralty Way, Lekki",
      city: "Lekki",
      state: "Lagos",
      country: "Nigeria",
      quantity: 2,
    },
    buyerCookie,
  );
  assert.equal(okOrderRes.statusCode, 200);
  const authOrder = okOrderRes.json();
  assert.equal(
    (await send("GET", "/config")).json().settings.printedBookStockCount,
    1,
  );

  // Authenticated owner sees it via /me/printed-orders & /printed-orders/lookup without token
  const myOrders = (
    await send("GET", "/me/printed-orders", undefined, buyerCookie)
  ).json();
  assert.equal(myOrders.some((o: { id: number }) => o.id === authOrder.id), true);
  assert.equal(
    (
      await send(
        "GET",
        `/printed-orders/lookup?orderNumber=${authOrder.orderNumber}`,
        undefined,
        buyerCookie,
      )
    ).statusCode,
    200,
  );

  // 2. Request expiring access link via email -> generates emailed token; expired token is denied
  emailService.sentOrderLinks = [];
  const reqAccess = await send("POST", "/printed-orders/request-access", {
    orderNumber: authOrder.orderNumber,
    email: "auth-printed@example.org",
  });
  assert.equal(reqAccess.statusCode, 200);
  assert.equal(emailService.sentOrderLinks.length, 1);
  const emailedUrl = new URL(emailService.sentOrderLinks[0].accessUrl);
  const emailedToken = emailedUrl.searchParams.get("token");
  assert.ok(emailedToken);

  assert.equal(
    (
      await send(
        "GET",
        `/printed-orders/lookup?orderNumber=${authOrder.orderNumber}&token=${emailedToken}`,
      )
    ).statusCode,
    200,
  );

  // Force all tokens for this order to expire -> token lookup now fails (403)
  const dbExp = openDatabase(databasePath);
  try {
    dbExp.sqlite
      .prepare(
        `UPDATE printed_order_access_tokens
         SET expires_at = '2020-01-01T00:00:00.000Z'
         WHERE order_id = ?`,
      )
      .run(authOrder.id);
  } finally {
    dbExp.sqlite.close();
  }
  assert.equal(
    (
      await send(
        "GET",
        `/printed-orders/lookup?orderNumber=${authOrder.orderNumber}&token=${emailedToken}`,
      )
    ).statusCode,
    403,
  );

  // 3. Quote + approve + bank_transfer submit -> public /printed-orders/verify MUST reject bank transfers (400)
  await send(
    "PATCH",
    `/admin/printed-orders/${authOrder.id}`,
    { deliveryFeeKobo: 150000 },
    adminCookie,
  );
  await send(
    "POST",
    `/printed-orders/${authOrder.id}/approve-quote`,
    {},
    buyerCookie,
  );
  const btPay = await send(
    "POST",
    `/printed-orders/${authOrder.id}/pay`,
    { paymentMethod: "bank_transfer", transferReference: "NIP-BOOK-554433" },
    buyerCookie,
  );
  assert.equal(btPay.statusCode, 200);
  const verifyBtAttempt = await send(
    "POST",
    "/printed-orders/verify",
    { reference: btPay.json().reference },
    buyerCookie,
  );
  assert.equal(verifyBtAttempt.statusCode, 400);

  // 4. Cancelling the order restores the 2 copies back to confirmed inventory (1 -> 3), and cancelled order cannot be shipped
  const cancelRes = await send(
    "PATCH",
    `/admin/printed-orders/${authOrder.id}`,
    { fulfillmentStatus: "cancelled" },
    adminCookie,
  );
  assert.equal(cancelRes.statusCode, 200);
  assert.equal(
    (await send("GET", "/config")).json().settings.printedBookStockCount,
    3,
  );
  assert.equal(
    (
      await send(
        "PATCH",
        `/admin/printed-orders/${authOrder.id}`,
        { fulfillmentStatus: "shipped", dispatchExceptionNote: "Should fail" },
        adminCookie,
      )
    ).statusCode,
    400,
  );

  // Reset stock back to unconfigured (null) to leave clean config state
  await send(
    "PUT",
    "/admin/settings",
    { ...settings, printedBookStockCount: null },
    adminCookie,
  );
  assert.equal(
    (await send("GET", "/config")).json().settings.printedBookStockCount,
    null,
  );
});

test("Admin Dashboard Overview: 12 KPIs, chart series, webhook idempotency, and privacy integrity", async () => {
  const overview = (
    await send("GET", "/admin/overview", undefined, adminCookie)
  ).json();

  // 1. Verify all 12 KPI metrics are returned
  assert.ok(typeof overview.metrics.readers === "number");
  assert.ok(typeof overview.metrics.totalRegisteredReaders === "number");
  assert.ok(typeof overview.metrics.activeOnlineReaders === "number");
  assert.ok(typeof overview.metrics.expiringOnlineAccessSoon === "number");
  assert.ok(typeof overview.metrics.expiredOnlineAccess === "number");
  assert.ok(typeof overview.metrics.pendingDigitalPurchases === "number");
  assert.ok(typeof overview.metrics.pendingPrintedOrders === "number");
  assert.ok(typeof overview.metrics.ordersAwaitingDelivery === "number");
  assert.ok(typeof overview.metrics.deliveredOrders === "number");
  assert.ok(typeof overview.metrics.digitalAccessRevenueKobo === "number");
  assert.ok(typeof overview.metrics.printedBookRevenueKobo === "number");
  assert.ok(typeof overview.metrics.totalSalesKobo === "number");

  // 2. Verify charts structure
  assert.ok(Array.isArray(overview.charts.salesByPeriod.daily));
  assert.ok(Array.isArray(overview.charts.salesByPeriod.weekly));
  assert.ok(Array.isArray(overview.charts.salesByPeriod.monthly));
  assert.ok(typeof overview.charts.digitalVsPrinted.digitalKobo === "number");
  assert.ok(typeof overview.charts.digitalVsPrinted.printedKobo === "number");
  assert.ok(Array.isArray(overview.charts.registrationsByMonth));
  assert.ok(Array.isArray(overview.charts.ordersByFulfillmentStatus));

  // 3. Webhook idempotency test for printed order and digital purchase references
  const webhookKey = "mock-secret";
  const printedOrder = overview.printedOrders.find(
    (po: { paymentStatus: string }) => po.paymentStatus === "paid",
  );
  if (printedOrder && printedOrder.paymentReference) {
    const replayPayload = {
      event: "charge.success",
      data: { reference: printedOrder.paymentReference },
    };
    const replayRes = await send(
      "POST",
      "/webhooks/paystack",
      replayPayload,
      undefined,
      {
        "x-paystack-signature": webhookKey,
      },
    );
    assert.equal(replayRes.statusCode, 200);
    assert.equal(replayRes.json().received, true);
    assert.equal(replayRes.json().processed, true);
    assert.equal(replayRes.json().kind, "printed_order");
  }

  // 4. Privacy integrity: overview payload NEVER leaks reader journal contents
  const overviewText = JSON.stringify(overview);
  assert.equal(overviewText.includes("My 12-Month Reflection"), false);
  assert.equal(
    overviewText.includes("Saved during my active 12-month access."),
    false,
  );
});

