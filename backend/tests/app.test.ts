import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { addMonths } from "../src/services/subscriptions.js";
import {
  addCalendarMonths,
  computeDigitalTermWindow,
} from "../src/services/commerce.js";
import { openDatabase } from "../src/db.js";
import { hashPassword, tokenHash } from "../src/auth.js";
import { generateTotpCode } from "../src/services/mfa.js";
import { adminSessions, adminUsers } from "../src/schema.js";
import { eq } from "drizzle-orm";
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
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
  type PushSubscriptionTarget,
  type SafePushPayload,
  type WebPushProvider,
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
  public sentAdminResets: PasswordResetEmailInput[] = [];
  public sentOrderLinks: OrderAccessEmailInput[] = [];

  async sendPasswordReset(input: PasswordResetEmailInput) {
    this.sent.push(input);
  }

  async sendAdminPasswordReset(input: PasswordResetEmailInput) {
    this.sentAdminResets.push(input);
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
    payload: SafePushPayload;
  }> = [];
  public expiredEndpoints = new Set<string>();
  public transientFailureEndpoints = new Set<string>();

  async sendNotification(
    subscription: PushSubscriptionTarget,
    payload: SafePushPayload,
  ): Promise<{ statusCode: number }> {
    if (this.expiredEndpoints.has(subscription.endpoint)) {
      return { statusCode: 410 };
    }
    if (this.transientFailureEndpoints.has(subscription.endpoint)) {
      return { statusCode: 503 };
    }
    this.deliveries.push({
      endpoint: subscription.endpoint,
      payload,
    });
    return { statusCode: 201 };
  }
}

let folder = "";
let databasePath = "";
let app: Awaited<ReturnType<typeof buildApp>>;
let paystackProvider: MockPaystackProvider;
let emailService: MockEmailService;
let pushProvider: MockWebPushProvider;
let adminCookie = "";
let ownerAdminId = 0;
let ownerMfaSecret = "";
let ownerRecoveryCodes: string[] = [];
let subscriberCookie = "";
let subscriberId = 0;
let guestCookie = "";
let guestId = 0;

const send = async (
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  payload?: string | object | Buffer,
  cookie = "",
  extraHeaders: Record<string, string> = {},
) => {
  const cleanUrl = url.split("?")[0] || "";
  const isAdmin =
    cleanUrl === "/admin" || cleanUrl.startsWith("/admin/");
  return await app.inject({
    method,
    url: "/api/v1" + url,
    payload,
    headers: {
      cookie,
      "x-requested-with": isAdmin ? "BalancedLifeAdmin" : "BalancedLife",
      ...extraHeaders,
    },
  });
};

before(async () => {
  folder = mkdtempSync(join(tmpdir(), "balanced-app-test-"));
  databasePath = join(folder, "test.sqlite");

  // Bootstrap owner administrator in dedicated admin_users table (separate from reader users)
  const store = openDatabase(databasePath);
  const now = new Date().toISOString();
  const insertedOwner = store.db
    .insert(adminUsers)
    .values({
      name: "Constance Nwisi",
      email: "owner-admin@cossyteens.com",
      passwordHash: await hashPassword("Admin-Strong-Pass-2027!"),
      role: "owner",
      status: "active",
      suspendedReason: "",
      mfaEnabled: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  ownerAdminId = insertedOwner.id;
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

  // Password login -> mandatory initial MFA enrollment
  const adminLogin = await send("POST", "/admin/auth/login", {
    email: "owner-admin@cossyteens.com",
    password: "Admin-Strong-Pass-2027!",
  });
  assert.equal(adminLogin.statusCode, 200);
  assert.equal(adminLogin.json().nextStep, "enroll_mfa");
  const rawSetCookie = String(adminLogin.headers["set-cookie"]);
  assert.match(rawSetCookie, /balanced_admin_session=/);
  assert.match(rawSetCookie, /HttpOnly/);
  assert.match(rawSetCookie, /SameSite=Strict/);
  assert.equal(/Domain=/i.test(rawSetCookie), false);
  adminCookie = rawSetCookie.split(";")[0];

  // Unverified MFA session cannot access protected admin endpoints yet
  assert.equal(
    (await send("GET", "/admin/overview", undefined, adminCookie)).statusCode,
    403,
  );

  // Enroll & confirm TOTP MFA
  const enrollRes = await send("POST", "/admin/auth/mfa/enroll", {}, adminCookie);
  assert.equal(enrollRes.statusCode, 200);
  ownerMfaSecret = enrollRes.json().manualEntryKey;
  assert.ok(enrollRes.json().otpauthUri.startsWith("otpauth://totp/"));

  const confirmRes = await send(
    "POST",
    "/admin/auth/mfa/confirm",
    { code: generateTotpCode(ownerMfaSecret) },
    adminCookie,
  );
  assert.equal(confirmRes.statusCode, 200);
  assert.equal(confirmRes.json().admin.mfaEnabled, true);
  assert.equal(confirmRes.json().admin.mfaVerified, true);
  ownerRecoveryCodes = confirmRes.json().recoveryCodes;
  assert.equal(ownerRecoveryCodes.length, 8);

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
  // Reader session cookie (balanced_session) is never accepted for admin endpoints
  assert.equal(
    (await send("GET", "/admin/overview", undefined, guestCookie)).statusCode,
    401,
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
    401,
  );
  assert.equal(
    (
      await send(
        "POST",
        "/admin/devotionals",
        entryFixture,
        guestCookie,
        { "x-requested-with": "BalancedLife" },
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

test("Separated Admin Auth: reader vs admin login isolation, distinct emails, origin separation, MFA verify/recovery, lockout, idle timeout, suspension & password reset", async () => {
  // 1. Reader email cannot share owner admin email; admin cannot log into reader login
  assert.equal(
    (
      await send("POST", "/auth/register", {
        name: "Impersonator",
        email: "owner-admin@cossyteens.com",
        password: "Reader-Pass-2027!",
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await send("POST", "/auth/login", {
        email: "owner-admin@cossyteens.com",
        password: "Admin-Strong-Pass-2027!",
      })
    ).statusCode,
    401,
  );

  // 2. Reader account cannot log into admin auth login
  assert.equal(
    (
      await send("POST", "/admin/auth/login", {
        email: "alex@example.org",
        password: "Brand-New-Password-2027!",
      })
    ).statusCode,
    401,
  );

  // 3. Cross-portal Origin / CSRF checks
  assert.equal(
    (
      await send("POST", "/admin/auth/login", {
        email: "owner-admin@cossyteens.com",
        password: "Admin-Strong-Pass-2027!",
      }, "", {
        origin: "http://localhost:5173",
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await send("POST", "/journals", { title: "X", body: "Y" }, subscriberCookie, {
        origin: "http://localhost:5174",
      })
    ).statusCode,
    403,
  );

  // 4. Subsequent admin login triggers MFA challenge, TOTP code unlocks, backup recovery works once
  const relogin = await send("POST", "/admin/auth/login", {
    email: "owner-admin@cossyteens.com",
    password: "Admin-Strong-Pass-2027!",
  });
  assert.equal(relogin.statusCode, 200);
  assert.equal(relogin.json().nextStep, "verify_mfa");
  const challengeCookie = String(relogin.headers["set-cookie"]).split(";")[0];

  assert.equal(
    (await send("GET", "/admin/overview", undefined, challengeCookie))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await send(
        "POST",
        "/admin/auth/mfa/verify",
        { code: "000000" },
        challengeCookie,
      )
    ).statusCode,
    401,
  );
  const verifyOk = await send(
    "POST",
    "/admin/auth/mfa/verify",
    { code: generateTotpCode(ownerMfaSecret) },
    challengeCookie,
  );
  assert.equal(verifyOk.statusCode, 200);
  assert.equal(verifyOk.json().admin.mfaVerified, true);
  assert.equal(
    (await send("GET", "/admin/overview", undefined, challengeCookie))
      .statusCode,
    200,
  );

  // Logout immediately revokes cookie in DB
  assert.equal(
    (await send("POST", "/admin/auth/logout", {}, challengeCookie)).statusCode,
    200,
  );
  assert.equal(
    (await send("GET", "/admin/overview", undefined, challengeCookie))
      .statusCode,
    401,
  );

  // 5. Recovery code login (single use)
  const relogin2 = await send("POST", "/admin/auth/login", {
    email: "owner-admin@cossyteens.com",
    password: "Admin-Strong-Pass-2027!",
  });
  const challengeCookie2 = String(relogin2.headers["set-cookie"]).split(";")[0];
  const singleUseCode = ownerRecoveryCodes[0];
  const recoverOk = await send(
    "POST",
    "/admin/auth/mfa/recover",
    { recoveryCode: singleUseCode },
    challengeCookie2,
  );
  assert.equal(recoverOk.statusCode, 200);
  assert.equal(recoverOk.json().admin.mfaVerified, true);

  // Reusing same recovery code fails
  const relogin3 = await send("POST", "/admin/auth/login", {
    email: "owner-admin@cossyteens.com",
    password: "Admin-Strong-Pass-2027!",
  });
  const challengeCookie3 = String(relogin3.headers["set-cookie"]).split(";")[0];
  assert.equal(
    (
      await send(
        "POST",
        "/admin/auth/mfa/recover",
        { recoveryCode: singleUseCode },
        challengeCookie3,
      )
    ).statusCode,
    401,
  );

  // 6. Idle timeout invalidation & absolute expiry invalidation
  const dbStore = openDatabase(databasePath);
  const rawToken2 = challengeCookie2.split("=")[1];
  const staleIso = new Date(Date.now() - 45 * 60_000).toISOString();
  dbStore.db
    .update(adminSessions)
    .set({ lastActivityAt: staleIso })
    .where(eq(adminSessions.tokenHash, tokenHash(rawToken2)))
    .run();
  dbStore.sqlite.close();

  assert.equal(
    (await send("GET", "/admin/overview", undefined, challengeCookie2))
      .statusCode,
    401,
  );

  // Clean up challengeCookie3
  await send("POST", "/admin/auth/logout", {}, challengeCookie3);
});

test("RBAC enforcement across Owner, Content Editor, Orders Manager, Finance Manager, Lockout, Suspension, Staff API & Activity Log", async () => {
  // Reject creating staff email matching existing reader
  assert.equal(
    (
      await send(
        "POST",
        "/admin/staff",
        {
          name: "Collision Staff",
          email: "alex@example.org",
          role: "orders_manager",
          password: "Staff-Strong-Pass-2027!",
        },
        adminCookie,
      )
    ).statusCode,
    409,
  );

  // Create one staff member for each delegated role
  const roles = [
    { role: "content_editor", email: "editor-staff@cossyteens.com" },
    { role: "orders_manager", email: "orders-staff@cossyteens.com" },
    { role: "finance_manager", email: "finance-staff@cossyteens.com" },
  ] as const;

  const staffCookies: Record<string, string> = {};
  const staffIds: Record<string, number> = {};

  for (const spec of roles) {
    const createRes = await send(
      "POST",
      "/admin/staff",
      {
        name: `Test ${spec.role}`,
        email: spec.email,
        role: spec.role,
        password: "Staff-Strong-Pass-2027!",
      },
      adminCookie,
    );
    assert.equal(createRes.statusCode, 200);
    staffIds[spec.role] = createRes.json().id;

    // Login & complete MFA enrollment
    const loginRes = await send("POST", "/admin/auth/login", {
      email: spec.email,
      password: "Staff-Strong-Pass-2027!",
    });
    assert.equal(loginRes.statusCode, 200);
    const cookie = String(loginRes.headers["set-cookie"]).split(";")[0];
    const enroll = await send("POST", "/admin/auth/mfa/enroll", {}, cookie);
    const otp = generateTotpCode(enroll.json().manualEntryKey);
    const confirm = await send(
      "POST",
      "/admin/auth/mfa/confirm",
      { code: otp },
      cookie,
    );
    assert.equal(confirm.statusCode, 200);
    staffCookies[spec.role] = cookie;
  }

  // Content editor: allowed devotionals, denied printed orders, payments, settings, staff
  assert.equal(
    (await send("GET", "/admin/devotionals", undefined, staffCookies.content_editor))
      .statusCode,
    200,
  );
  assert.equal(
    (
      await send(
        "GET",
        "/admin/printed-orders",
        undefined,
        staffCookies.content_editor,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await send("GET", "/admin/settings", undefined, staffCookies.content_editor)
    ).statusCode,
    403,
  );
  assert.equal(
    (await send("GET", "/admin/staff", undefined, staffCookies.content_editor))
      .statusCode,
    403,
  );

  // Create a fresh printed order for RBAC action tests
  const printedRes = await send("POST", "/printed-orders", {
    fullName: "RBAC Test Customer",
    email: "rbac-cust@example.org",
    phone: "+2348099988877",
    streetAddress: "7 Allen Avenue",
    city: "Lagos",
    state: "Lagos",
    country: "Nigeria",
    quantity: 1,
  });
  const printedOrderId = printedRes.json().id;

  // Orders manager: CAN update delivery quote, CANNOT confirm payment status as paid, CANNOT publish devotional or view staff
  assert.equal(
    (
      await send(
        "PATCH",
        `/admin/printed-orders/${printedOrderId}`,
        { deliveryFeeKobo: 200000, deliveryQuoteNote: "Dispatch rider quote" },
        staffCookies.orders_manager,
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await send(
        "PATCH",
        `/admin/printed-orders/${printedOrderId}`,
        { paymentStatus: "paid" },
        staffCookies.orders_manager,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (await send("GET", "/admin/staff", undefined, staffCookies.orders_manager))
      .statusCode,
    403,
  );

  // Finance manager: CAN confirm printed order payment & view audit activity, CANNOT modify devotionals or staff
  assert.equal(
    (
      await send(
        "PATCH",
        `/admin/printed-orders/${printedOrderId}`,
        { paymentStatus: "paid", adminNotes: "Verified by finance desk" },
        staffCookies.finance_manager,
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (await send("GET", "/admin/activity", undefined, staffCookies.finance_manager))
      .statusCode,
    200,
  );
  assert.equal(
    (
      await send(
        "PUT",
        "/admin/themes/1",
        { title: "Blocked", description: "Blocked" },
        staffCookies.finance_manager,
      )
    ).statusCode,
    403,
  );

  // Owner: cannot suspend self, can suspend orders_manager & immediately invalidates session
  assert.equal(
    (
      await send(
        "PATCH",
        `/admin/staff/${ownerAdminId}`,
        { status: "suspended" },
        adminCookie,
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await send(
        "PATCH",
        `/admin/staff/${staffIds.orders_manager}`,
        { status: "suspended", suspendedReason: "Rotation test" },
        adminCookie,
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await send(
        "GET",
        "/admin/overview",
        undefined,
        staffCookies.orders_manager,
      )
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await send("POST", "/admin/auth/login", {
        email: "orders-staff@cossyteens.com",
        password: "Staff-Strong-Pass-2027!",
      })
    ).statusCode,
    403,
  );

  // Lockout after 5 failed passwords + Admin password recovery flow
  for (let i = 0; i < 5; i++) {
    await send("POST", "/admin/auth/login", {
      email: "editor-staff@cossyteens.com",
      password: "Wrong-Password-Attempt!",
    });
  }
  const lockedLogin = await send("POST", "/admin/auth/login", {
    email: "editor-staff@cossyteens.com",
    password: "Staff-Strong-Pass-2027!",
  });
  assert.equal(lockedLogin.statusCode, 423);

  const forgotRes = await send("POST", "/admin/auth/forgot-password", {
    email: "editor-staff@cossyteens.com",
  });
  assert.equal(forgotRes.statusCode, 200);
  const resetEmail = emailService.sentAdminResets.find(
    (m) => m.to === "editor-staff@cossyteens.com",
  );
  assert.ok(resetEmail);
  assert.ok(resetEmail.resetUrl.startsWith("http://localhost:5174/reset-password?token="));
  const token = decodeURIComponent(resetEmail.resetUrl.split("token=")[1]);

  const resetRes = await send("POST", "/admin/auth/reset-password", {
    token,
    password: "Editor-Recovered-Pass-2027!",
  });
  assert.equal(resetRes.statusCode, 200);
  // Previous session invalidated by password reset
  assert.equal(
    (
      await send(
        "GET",
        "/admin/overview",
        undefined,
        staffCookies.content_editor,
      )
    ).statusCode,
    401,
  );
  // New password unlocks immediately
  assert.equal(
    (
      await send("POST", "/admin/auth/login", {
        email: "editor-staff@cossyteens.com",
        password: "Editor-Recovered-Pass-2027!",
      })
    ).statusCode,
    200,
  );

  // Audit activity log contains structured events
  const activityRes = await send(
    "GET",
    "/admin/activity?entityType=admin_staff",
    undefined,
    adminCookie,
  );
  assert.equal(activityRes.statusCode, 200);
  assert.ok(activityRes.json().items.length >= 2);
});

test("Migration 0008 safely preserves historical admin audit logs and revokes/demotes pre-existing reader-table admins", async () => {
  const migFolder = mkdtempSync(join(tmpdir(), "balanced-mig0008-"));
  const migDbPath = join(migFolder, "legacy.sqlite");
  try {
    const raw = new Database(migDbPath);
    raw.pragma("foreign_keys = ON");
    raw.exec(
      "CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)",
    );
    const migDir = resolve(process.cwd(), "migrations");
    const preMigrations = readdirSync(migDir)
      .filter((f) => f.endsWith(".sql") && f < "0008_")
      .sort();
    for (const file of preMigrations) {
      raw.exec(readFileSync(resolve(migDir, file), "utf8"));
      raw
        .prepare("INSERT INTO schema_migrations VALUES (?, ?)")
        .run(file, "2026-11-01T00:00:00.000Z");
    }

    // Seed pre-separation admin inside users, plus reader session & audit log
    const pwHash = await hashPassword("Legacy-Pass-2026!");
    raw
      .prepare(
        "INSERT INTO users (id, name, email, password_hash, role, status, suspended_reason, created_at, updated_at) VALUES (11, 'Jeremiah Legacy', 'legacy-admin@example.com', ?, 'admin', 'active', '', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')",
      )
      .run(pwHash);
    raw
      .prepare(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('old-legacy-token-hash', 11, '2028-01-01T00:00:00.000Z')",
      )
      .run();
    raw
      .prepare(
        "INSERT INTO admin_audit_logs (id, admin_id, action, created_at) VALUES (39, 11, 'Granted administrator access', '2026-11-08 18:15:20')",
      )
      .run();
    raw.close();

    // Run openDatabase (executes 0008)
    const migrated = openDatabase(migDbPath);
    const demotedUser = migrated.sqlite
      .prepare(
        "SELECT role, legacy_admin_status FROM users WHERE id = 11",
      )
      .get() as { role: string; legacy_admin_status: string };
    assert.equal(demotedUser.role, "reader");
    assert.equal(demotedUser.legacy_admin_status, "pending_decision");

    const oldSessCount = (
      migrated.sqlite
        .prepare("SELECT COUNT(*) AS c FROM sessions WHERE user_id = 11")
        .get() as { c: number }
    ).c;
    assert.equal(oldSessCount, 0);

    const preservedAudit = migrated.sqlite
      .prepare(
        "SELECT admin_id, legacy_user_admin_id, actor_name, actor_email, actor_role, action FROM admin_audit_logs WHERE id = 39",
      )
      .get() as {
      admin_id: number | null;
      legacy_user_admin_id: number | null;
      actor_name: string;
      actor_email: string;
      actor_role: string;
      action: string;
    };
    assert.equal(preservedAudit.admin_id, null);
    assert.equal(preservedAudit.legacy_user_admin_id, 11);
    assert.equal(preservedAudit.actor_name, "Jeremiah Legacy");
    assert.equal(preservedAudit.actor_email, "legacy-admin@example.com");
    assert.equal(preservedAudit.actor_role, "legacy_admin");
    assert.equal(preservedAudit.action, "Granted administrator access");

    const fkErrors = migrated.sqlite.pragma("foreign_key_check") as unknown[];
    assert.equal(fkErrors.length, 0);
    migrated.sqlite.close();
  } finally {
    rmSync(migFolder, { recursive: true, force: true });
  }
});

test("Production hardening: fail-fast ADMIN_MFA_ENCRYPTION_KEY and origin validation, strict CSP header, production origin isolation, and WAL-safe SQLite online backup", async () => {
  const prevKey = process.env.ADMIN_MFA_ENCRYPTION_KEY;
  const prevAppOrigin = process.env.APP_ORIGIN;
  const prevAdminOrigin = process.env.ADMIN_ORIGIN;
  try {
    process.env.APP_ORIGIN = "https://cossyteens.com";
    process.env.ADMIN_ORIGIN = "https://admin.cossyteens.com";

    // 1. Production boot fails fast when ADMIN_MFA_ENCRYPTION_KEY is missing or weak
    delete process.env.ADMIN_MFA_ENCRYPTION_KEY;
    await assert.rejects(
      () => buildApp({ databasePath: ":memory:", environment: "production" }),
      /ADMIN_MFA_ENCRYPTION_KEY is required/i,
    );
    process.env.ADMIN_MFA_ENCRYPTION_KEY = "short";
    await assert.rejects(
      () => buildApp({ databasePath: ":memory:", environment: "production" }),
      /at least 16 characters/i,
    );

    // Production boot fails fast if APP_ORIGIN / ADMIN_ORIGIN are omitted
    process.env.ADMIN_MFA_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    delete process.env.ADMIN_ORIGIN;
    await assert.rejects(
      () => buildApp({ databasePath: ":memory:", environment: "production" }),
      /APP_ORIGIN and ADMIN_ORIGIN must be explicitly configured/i,
    );

    // 2. Valid production env boots cleanly, emits strict CSP, and blocks localhost / cross-portal origins
    process.env.ADMIN_ORIGIN = "https://admin.cossyteens.com";
    const prodApp = await buildApp({
      databasePath: ":memory:",
      environment: "production",
    });
    try {
      const healthRes = await prodApp.inject({
        method: "GET",
        url: "/api/v1/health",
      });
      assert.equal(healthRes.statusCode, 200);
      const csp = String(healthRes.headers["content-security-policy"] || "");
      assert.match(csp, /default-src 'self'/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /object-src 'none'/);
      assert.match(csp, /script-src 'self'/);
      assert.match(csp, /upgrade-insecure-requests/);

      // Localhost and reader-portal origins are blocked on admin routes in production mode
      const devOriginRejected = await prodApp.inject({
        method: "POST",
        url: "/api/v1/admin/auth/login",
        headers: {
          "x-requested-with": "BalancedLifeAdmin",
          origin: "http://localhost:5174",
        },
        payload: { email: "missing@cossyteens.com", password: "invalid" },
      });
      assert.equal(devOriginRejected.statusCode, 403);

      const readerOriginOnAdmin = await prodApp.inject({
        method: "POST",
        url: "/api/v1/admin/auth/login",
        headers: {
          "x-requested-with": "BalancedLifeAdmin",
          origin: "https://cossyteens.com",
        },
        payload: { email: "missing@cossyteens.com", password: "invalid" },
      });
      assert.equal(readerOriginOnAdmin.statusCode, 403);

      const adminOriginOnReader = await prodApp.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: {
          "x-requested-with": "BalancedLife",
          origin: "https://admin.cossyteens.com",
        },
        payload: { email: "missing@example.com", password: "invalid" },
      });
      assert.equal(adminOriginOnReader.statusCode, 403);
    } finally {
      await prodApp.close();
    }
  } finally {
    if (prevKey === undefined) delete process.env.ADMIN_MFA_ENCRYPTION_KEY;
    else process.env.ADMIN_MFA_ENCRYPTION_KEY = prevKey;
    if (prevAppOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = prevAppOrigin;
    if (prevAdminOrigin === undefined) delete process.env.ADMIN_ORIGIN;
    else process.env.ADMIN_ORIGIN = prevAdminOrigin;
  }

  // 3. WAL-safe SQLite online .backup() captures WAL writes and passes integrity + FK restoration checks
  const backupFolder = mkdtempSync(join(tmpdir(), "balanced-wal-backup-"));
  const backupPath = join(backupFolder, "snapshot.sqlite");
  try {
    const live = openDatabase(databasePath);
    await live.sqlite.backup(backupPath);
    live.sqlite.close();

    const verifyDb = new Database(backupPath, { readonly: true });
    assert.equal(verifyDb.pragma("integrity_check", { simple: true }), "ok");
    assert.equal(
      (verifyDb.pragma("foreign_key_check") as unknown[]).length,
      0,
    );
    const adminCount = (
      verifyDb.prepare("SELECT count(*) AS n FROM admin_users").get() as {
        n: number;
      }
    ).n;
    assert.ok(adminCount >= 1);
    verifyDb.close();
  } finally {
    rmSync(backupFolder, { recursive: true, force: true });
  }
});

test("Authoritative reader access states, onboarding persistence, content gating, and legacy/complimentary preservation", async () => {
  const devList = (await send("GET", "/devotionals")).json();
  const sampleEntry = devList.find((d: { sample: boolean }) => d.sample);
  const lockedEntry = devList.find((d: { sample: boolean }) => !d.sample);
  assert.ok(sampleEntry && lockedEntry);

  // 1. Guest state
  const anonMe = (await send("GET", "/auth/me")).json();
  assert.equal(anonMe.user, null);
  assert.equal(anonMe.access.status, "guest");
  assert.equal(anonMe.access.hasAccess, false);
  assert.equal(anonMe.unreadNotificationsCount, 0);
  assert.equal((await send("GET", "/me/dashboard")).statusCode, 401);
  assert.equal(
    (await send("GET", `/devotionals/${sampleEntry.id}`)).statusCode,
    200,
  );
  assert.equal(
    (await send("GET", `/devotionals/${lockedEntry.id}`)).statusCode,
    403,
  );

  // 2. Newly registered reader -> free state & onboardingCompletedAt = null
  const reg = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    remoteAddress: "203.0.113.20",
    headers: { "x-requested-with": "BalancedLife" },
    payload: {
      name: "Kemi Access",
      email: "kemi-access@example.org",
      password: "Kemi-Strong-Pass-2027!",
    },
  });
  assert.equal(reg.statusCode, 200);
  assert.equal(reg.json().user.onboardingCompletedAt, null);
  let readerCookie = String(reg.headers["set-cookie"]).split(";")[0];
  const readerId = reg.json().user.id;

  const freeMe = (await send("GET", "/auth/me", undefined, readerCookie)).json();
  assert.equal(freeMe.access.status, "free");
  assert.equal(freeMe.access.hasAccess, false);

  const freeDash = (
    await send("GET", "/me/dashboard", undefined, readerCookie)
  ).json();
  assert.equal(freeDash.accessStatus, "free");
  assert.equal(freeDash.onboardingCompleted, false);
  assert.equal(freeDash.streakDays, 0);
  assert.ok(freeDash.freeSample);
  assert.ok(Array.isArray(freeDash.lockedPreviews));

  // Persistent onboarding dismiss & Account reopen survives re-login
  const dismissRes = await send(
    "POST",
    "/me/onboarding",
    { completed: true },
    readerCookie,
  );
  assert.equal(dismissRes.statusCode, 200);
  assert.ok(dismissRes.json().user.onboardingCompletedAt);

  await send("POST", "/auth/logout", {}, readerCookie);
  const reLogin = await send("POST", "/auth/login", {
    email: "kemi-access@example.org",
    password: "Kemi-Strong-Pass-2027!",
  });
  readerCookie = String(reLogin.headers["set-cookie"]).split(";")[0];
  assert.equal(
    (await send("GET", "/me/dashboard", undefined, readerCookie)).json()
      .onboardingCompleted,
    true,
  );

  await send("POST", "/me/onboarding", { completed: false }, readerCookie);
  assert.equal(
    (await send("GET", "/me/dashboard", undefined, readerCookie)).json()
      .onboardingCompleted,
    false,
  );
  await send("POST", "/me/onboarding", { completed: true }, readerCookie);

  // 3. Pending payment state MUST NOT unlock premium devotionals
  const checkoutRes = await send(
    "POST",
    "/digital-purchases/checkout",
    { paymentMethod: "paystack", currency: "NGN" },
    readerCookie,
  );
  assert.equal(checkoutRes.statusCode, 200);
  const ref = checkoutRes.json().reference;
  const pendingDash = (
    await send("GET", "/me/dashboard", undefined, readerCookie)
  ).json();
  assert.equal(pendingDash.accessStatus, "pending_payment");
  assert.equal(pendingDash.hasAccess, false);
  assert.equal(pendingDash.access.pendingPurchase.reference, ref);
  assert.equal(
    (
      await send(
        "GET",
        `/devotionals/${lockedEntry.id}`,
        undefined,
        readerCookie,
      )
    ).statusCode,
    403,
  );

  // 4. Verified payment before 2027 -> scheduled state (still 403 on premium devotionals)
  const verifyRes = await send(
    "POST",
    "/digital-purchases/verify",
    { reference: ref },
    readerCookie,
  );
  assert.equal(verifyRes.statusCode, 200);
  const schedDash = (
    await send("GET", "/me/dashboard", undefined, readerCookie)
  ).json();
  assert.equal(schedDash.accessStatus, "scheduled");
  assert.equal(schedDash.hasAccess, false);
  assert.equal(
    (
      await send(
        "GET",
        `/devotionals/${lockedEntry.id}`,
        undefined,
        readerCookie,
      )
    ).statusCode,
    403,
  );

  // 5. Active state + streak / journal / bookmark creation
  const nowMs = Date.now();
  const activeStart = new Date(nowMs - 86400000 * 5).toISOString();
  const activeEnd = new Date(nowMs + 86400000 * 60).toISOString();
  {
    const db = openDatabase(databasePath);
    try {
      db.sqlite
        .prepare(
          "UPDATE digital_entitlements SET starts_at = ?, expires_at = ? WHERE user_id = ?",
        )
        .run(activeStart, activeEnd, readerId);
    } finally {
      db.sqlite.close();
    }
  }
  const activeDash = (
    await send("GET", "/me/dashboard", undefined, readerCookie)
  ).json();
  assert.equal(activeDash.accessStatus, "active");
  assert.equal(activeDash.hasAccess, true);
  assert.equal(
    (
      await send(
        "GET",
        `/devotionals/${lockedEntry.id}`,
        undefined,
        readerCookie,
      )
    ).statusCode,
    200,
  );

  assert.equal(
    (
      await send(
        "POST",
        `/me/progress/${lockedEntry.id}`,
        { completed: true },
        readerCookie,
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await send(
        "POST",
        `/me/bookmarks/${lockedEntry.id}`,
        { saved: true },
        readerCookie,
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await send(
        "POST",
        "/me/journal",
        {
          devotionalId: lockedEntry.id,
          title: "Intentional Stewardship",
          lessonLearned: "Intentional stewardship",
          body: "Consistent habits compound.",
          actionStep: "Read every morning",
          prayerFocus: "Help me stay steady.",
          completed: true,
        },
        readerCookie,
      )
    ).statusCode,
    200,
  );
  const activeAfterReading = (
    await send("GET", "/me/dashboard", undefined, readerCookie)
  ).json();
  assert.equal(activeAfterReading.streakDays, 1);
  assert.equal(activeAfterReading.bookmarksCount, 1);
  assert.equal(activeAfterReading.journalsCount, 1);

  // 6. Expiring soon state (within 14-day reminder window)
  {
    const db = openDatabase(databasePath);
    try {
      db.sqlite
        .prepare(
          "UPDATE digital_entitlements SET expires_at = ? WHERE user_id = ?",
        )
        .run(new Date(nowMs + 86400000 * 5).toISOString(), readerId);
    } finally {
      db.sqlite.close();
    }
  }
  const expSoonMe = (
    await send("GET", "/auth/me", undefined, readerCookie)
  ).json();
  assert.equal(expSoonMe.access.status, "expiring_soon");
  assert.equal(expSoonMe.access.expiringSoon, true);
  assert.equal(expSoonMe.access.hasAccess, true);

  // 7. Expired state -> premium locked (403), history/bookmarks/journals preserved
  {
    const db = openDatabase(databasePath);
    try {
      db.sqlite
        .prepare(
          "UPDATE digital_entitlements SET status = 'expired', expires_at = '2026-01-01T00:00:00.000Z' WHERE user_id = ?",
        )
        .run(readerId);
    } finally {
      db.sqlite.close();
    }
  }
  const expiredDash = (
    await send("GET", "/me/dashboard", undefined, readerCookie)
  ).json();
  assert.equal(expiredDash.accessStatus, "expired");
  assert.equal(expiredDash.hasAccess, false);
  assert.equal(expiredDash.completed, 1);
  assert.equal(expiredDash.bookmarksCount, 1);
  assert.equal(expiredDash.journalsCount, 1);
  assert.equal(
    (
      await send(
        "GET",
        `/devotionals/${lockedEntry.id}`,
        undefined,
        readerCookie,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (await send("GET", "/me/journal", undefined, readerCookie)).json().length,
    1,
  );

  // 8. Revoked state
  const revokeRes = await send(
    "POST",
    `/admin/users/${readerId}/revoke-access`,
    { reason: "Chargeback reversal" },
    adminCookie,
  );
  assert.equal(revokeRes.statusCode, 200);
  const revokedDash = (
    await send("GET", "/me/dashboard", undefined, readerCookie)
  ).json();
  assert.equal(revokedDash.accessStatus, "revoked");
  assert.equal(revokedDash.hasAccess, false);
  assert.ok(revokedDash.access.revokeReason);

  // 9. Preserved complimentary & legacy entitlements stay active
  const compMe = (
    await send("GET", "/auth/me", undefined, subscriberCookie)
  ).json();
  assert.equal(compMe.access.status, "active");
  assert.equal(compMe.access.source, "complimentary");
  assert.equal(compMe.access.hasAccess, true);
});

test("Admin Notification Composer RBAC, broadcast consent opt-in, idempotency, scheduling, reader isolation, inbox filters, and push tracking", async () => {
  // Register isolated readers from distinct client IPs to stay realistic under IP rate limits
  const regAsIp = (ip: string, name: string, email: string) =>
    app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      remoteAddress: ip,
      headers: { "x-requested-with": "BalancedLife" },
      payload: {
        name,
        email,
        password: "Notif-Strong-Pass-2027!",
      },
    });
  const regA = await regAsIp(
    "203.0.113.21",
    "Reader Alpha",
    "notif-alpha@example.org",
  );
  const regB = await regAsIp(
    "203.0.113.22",
    "Reader Beta",
    "notif-beta@example.org",
  );
  const regC = await regAsIp(
    "203.0.113.23",
    "Reader Gamma",
    "notif-gamma@example.org",
  );
  assert.equal(regA.statusCode, 200);
  assert.equal(regB.statusCode, 200);
  assert.equal(regC.statusCode, 200);

  const cookieA = String(regA.headers["set-cookie"]).split(";")[0];
  const cookieB = String(regB.headers["set-cookie"]).split(";")[0];
  const cookieC = String(regC.headers["set-cookie"]).split(";")[0];
  const userIdA = regA.json().user.id;

  // Announcements consent defaults to false for all new readers
  const initNotifsB = (
    await send("GET", "/me/notifications", undefined, cookieB)
  ).json();
  assert.equal(initNotifsB.preferences.announcementsEnabled, false);

  // Alpha opts into optional announcements and registers a Web Push endpoint; Beta stays default opted-out; Gamma disables all notifications
  await send(
    "PATCH",
    "/me/notifications/preferences",
    { notificationsEnabled: true, announcementsEnabled: true },
    cookieA,
  );
  const alphaEndpoint = "https://push.example.org/sub/notif-alpha-device";
  await send(
    "POST",
    "/me/notifications/push-subscribe",
    {
      endpoint: alphaEndpoint,
      keys: {
        p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfXRs",
        auth: "tBHItJI5svbpez7KI4CCXg",
      },
      deviceLabel: "Alpha Browser",
    },
    cookieA,
  );
  await send(
    "PATCH",
    "/me/notifications/preferences",
    { notificationsEnabled: false, announcementsEnabled: false },
    cookieC,
  );

  // Create fresh delegated staff to verify notification RBAC
  const makeStaff = async (
    name: string,
    email: string,
    role: "content_editor" | "orders_manager" | "finance_manager",
  ) => {
    const created = await send(
      "POST",
      "/admin/staff",
      {
        name,
        email,
        role,
        password: "Staff-Strong-Pass-2027!",
      },
      adminCookie,
    );
    assert.equal(created.statusCode, 200);
    const id = created.json().id;
    const login = await send("POST", "/admin/auth/login", {
      email,
      password: "Staff-Strong-Pass-2027!",
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const enroll = await send("POST", "/admin/auth/mfa/enroll", {}, cookie);
    const otp = generateTotpCode(enroll.json().manualEntryKey);
    const confirm = await send(
      "POST",
      "/admin/auth/mfa/confirm",
      { code: otp },
      cookie,
    );
    assert.equal(confirm.statusCode, 200);
    return { id, cookie };
  };

  const editor = await makeStaff(
    "Notify Editor",
    "notif-editor@cossyteens.com",
    "content_editor",
  );
  const finance = await makeStaff(
    "Notify Finance",
    "notif-finance@cossyteens.com",
    "finance_manager",
  );
  const orders = await makeStaff(
    "Notify Orders",
    "notif-orders@cossyteens.com",
    "orders_manager",
  );

  // Finance manager cannot view/send notification campaigns; content editor cannot compose/send campaigns
  assert.equal(
    (
      await send(
        "GET",
        "/admin/notifications/campaigns",
        undefined,
        finance.cookie,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await send(
        "POST",
        "/admin/notifications/campaigns",
        {
          targetType: "individual",
          targetUserId: userIdA,
          category: "account",
          title: "Blocked",
          body: "Should fail",
          actionUrl: "/dashboard",
        },
        editor.cookie,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await send(
        "POST",
        "/admin/notifications/campaigns",
        {
          targetType: "individual",
          targetUserId: userIdA,
          category: "account",
          title: "Blocked",
          body: "Should fail",
          actionUrl: "/dashboard",
        },
        finance.cookie,
      )
    ).statusCode,
    403,
  );

  // Orders manager CAN send individual account alert, CANNOT preview or send multi-reader broadcast by default
  const individualByOrders = await send(
    "POST",
    "/admin/notifications/campaigns",
    {
      targetType: "individual",
      targetUserId: userIdA,
      category: "account",
      title: "Delivery Note Ready",
      body: "Please review your dashboard notice.",
      actionUrl: "/dashboard",
    },
    orders.cookie,
  );
  assert.equal(individualByOrders.statusCode, 200);
  assert.equal(
    (
      await send(
        "POST",
        "/admin/notifications/preview",
        {
          targetType: "all",
          category: "announcement",
          title: "Unauthorized Broadcast",
          body: "Should be blocked without owner permission.",
          actionUrl: "/library",
        },
        orders.cookie,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await send(
        "POST",
        "/admin/notifications/campaigns",
        {
          targetType: "all",
          category: "announcement",
          title: "Unauthorized Broadcast",
          body: "Should be blocked without owner permission.",
          actionUrl: "/library",
          confirmed: true,
        },
        orders.cookie,
      )
    ).statusCode,
    403,
  );

  // Owner grants notifications.broadcast explicitly to orders manager -> broadcast preview & send now allowed
  const grantBroadcast = await send(
    "PATCH",
    `/admin/staff/${orders.id}`,
    { customPermissions: ["notifications.write", "notifications.broadcast"] },
    adminCookie,
  );
  assert.equal(grantBroadcast.statusCode, 200);
  assert.deepEqual(grantBroadcast.json().customPermissions, [
    "notifications.write",
    "notifications.broadcast",
  ]);
  assert.equal(
    (
      await send(
        "POST",
        "/admin/notifications/preview",
        {
          targetType: "all",
          category: "announcement",
          title: "Orders Broadcast Allowed",
          body: "Owner granted broadcast capability cleanly.",
          actionUrl: "/library",
        },
        orders.cookie,
      )
    ).statusCode,
    200,
  );

  // HTML tags and unsafe external URLs rejected (400); unconfirmed broadcast rejected (400)
  assert.equal(
    (
      await send(
        "POST",
        "/admin/notifications/campaigns",
        {
          targetType: "individual",
          targetUserId: userIdA,
          category: "account",
          title: "Bad <script>alert(1)</script>",
          body: "Invalid HTML payload",
          actionUrl: "/dashboard",
        },
        adminCookie,
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await send(
        "POST",
        "/admin/notifications/campaigns",
        {
          targetType: "individual",
          targetUserId: userIdA,
          category: "account",
          title: "Bad link",
          body: "Should block external phishing domain.",
          actionUrl: "https://evil.example/phish",
        },
        adminCookie,
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await send(
        "POST",
        "/admin/notifications/campaigns",
        {
          targetType: "all",
          category: "announcement",
          title: "Missing Confirmation",
          body: "Requires explicit dialog confirmation flag.",
          actionUrl: "/library",
          confirmed: false,
        },
        adminCookie,
      )
    ).statusCode,
    400,
  );

  // Admin accounts never appear in reader search
  const searchAdminEmail = (
    await send(
      "GET",
      "/admin/notifications/readers?search=owner-admin@cossyteens.com",
      undefined,
      adminCookie,
    )
  ).json();
  assert.equal(searchAdminEmail.items.length, 0);

  // Broadcast with idempotency key: Alpha (opted-in) receives it; Beta (announcementsEnabled=false) and Gamma (opted-out) do not
  const campPayload = {
    targetType: "all" as const,
    category: "announcement" as const,
    title: "2027 Devotional Update",
    body: "Explore the newly reviewed January themes today.",
    actionUrl: "/library",
    confirmed: true,
    idempotencyKey: "campaign-dedupe-key-2027",
  };
  const camp1 = await send(
    "POST",
    "/admin/notifications/campaigns",
    campPayload,
    adminCookie,
  );
  assert.equal(camp1.statusCode, 200);
  assert.equal(camp1.json().deduplicated, false);
  const camp1Id = camp1.json().campaign.id;

  const camp1Dup = await send(
    "POST",
    "/admin/notifications/campaigns",
    campPayload,
    adminCookie,
  );
  assert.equal(camp1Dup.statusCode, 200);
  assert.equal(camp1Dup.json().deduplicated, true);
  assert.equal(camp1Dup.json().campaign.id, camp1Id);

  const notifsA = (
    await send("GET", "/me/notifications?filter=all", undefined, cookieA)
  ).json();
  const notifsB = (
    await send("GET", "/me/notifications?filter=all", undefined, cookieB)
  ).json();
  const notifsC = (
    await send("GET", "/me/notifications?filter=all", undefined, cookieC)
  ).json();
  assert.equal(
    notifsA.events.some(
      (e: { title: string }) => e.title === "2027 Devotional Update",
    ),
    true,
  );
  assert.equal(
    notifsB.events.some(
      (e: { title: string }) => e.title === "2027 Devotional Update",
    ),
    false,
  );
  assert.equal(
    notifsC.events.some(
      (e: { title: string }) => e.title === "2027 Devotional Update",
    ),
    false,
  );

  // Opt Beta in to announcements without Web Push -> segment broadcast still arrives in Beta's in-app inbox
  await send(
    "PATCH",
    "/me/notifications/preferences",
    { notificationsEnabled: true, announcementsEnabled: true },
    cookieB,
  );
  const segSend = await send(
    "POST",
    "/admin/notifications/campaigns",
    {
      targetType: "segment",
      targetSegment: "free",
      category: "announcement",
      title: "Free Sample Highlight",
      body: "Try today's open devotional sample in your inbox.",
      actionUrl: "/library",
      confirmed: true,
    },
    adminCookie,
  );
  assert.equal(segSend.statusCode, 200);
  const betaInboxAfter = (
    await send("GET", "/me/notifications?filter=unread", undefined, cookieB)
  ).json();
  assert.equal(
    betaInboxAfter.events.some(
      (e: { title: string }) => e.title === "Free Sample Highlight",
    ),
    true,
  );

  // Scheduled future campaign: stays scheduled, cancellable, and runs at scheduledFor via worker
  const cancellableSched = await send(
    "POST",
    "/admin/notifications/campaigns",
    {
      targetType: "individual",
      targetUserId: userIdA,
      category: "system",
      title: "Cancelled Future Alert",
      body: "Should remain unsent after cancellation.",
      actionUrl: "/dashboard",
      scheduledFor: "2099-01-01T08:00:00.000Z",
    },
    adminCookie,
  );
  assert.equal(cancellableSched.statusCode, 200);
  assert.equal(cancellableSched.json().campaign.status, "scheduled");
  const cancelRes = await send(
    "POST",
    `/admin/notifications/campaigns/${cancellableSched.json().campaign.id}/cancel`,
    {},
    adminCookie,
  );
  assert.equal(cancelRes.statusCode, 200);
  assert.equal(cancelRes.json().campaign.status, "cancelled");

  const dueSoonAt = new Date(Date.now() + 60_000).toISOString();
  const schedRes = await send(
    "POST",
    "/admin/notifications/campaigns",
    {
      targetType: "individual",
      targetUserId: userIdA,
      category: "announcement",
      title: "Scheduled Morning Encouragement",
      body: "Delivered when scheduled time arrives.",
      actionUrl: "/dashboard",
      scheduledFor: dueSoonAt,
    },
    adminCookie,
  );
  assert.equal(schedRes.statusCode, 200);
  assert.equal(schedRes.json().campaign.status, "scheduled");

  // Push failure keeps pushProviderAccepted at 0 while recording in-app delivery cleanly
  pushProvider.transientFailureEndpoints.add(alphaEndpoint);
  const store = openDatabase(databasePath);
  try {
    await runNotificationWorkerCycle(
      store,
      pushProvider,
      new Date(Date.now() + 120_000),
    );
  } finally {
    store.sqlite.close();
  }
  pushProvider.transientFailureEndpoints.delete(alphaEndpoint);

  const schedHistoryBeforePushOk = (
    await send("GET", "/admin/notifications/campaigns", undefined, adminCookie)
  ).json();
  const schedItem = schedHistoryBeforePushOk.items.find(
    (c: { id: number }) => c.id === schedRes.json().campaign.id,
  );
  assert.equal(schedItem.status, "completed");
  assert.equal(schedItem.inAppCreatedCount, 1);
  assert.equal(schedItem.pushProviderAccepted, 0);
  assert.equal(schedItem.readCount, 0);

  // Worker dispatches successfully once gateway recovers
  const store2 = openDatabase(databasePath);
  try {
    await runNotificationWorkerCycle(
      store2,
      pushProvider,
      new Date(Date.now() + 600_000),
    );
  } finally {
    store2.sqlite.close();
  }
  const schedHistoryAfterPushOk = (
    await send("GET", "/admin/notifications/campaigns", undefined, adminCookie)
  ).json();
  const schedItemSent = schedHistoryAfterPushOk.items.find(
    (c: { id: number }) => c.id === schedRes.json().campaign.id,
  );
  assert.equal(schedItemSent.pushProviderAccepted, 1);
  assert.equal(schedItemSent.readCount, 0);

  // Reader isolation: Beta cannot read or mark Alpha's notification as read
  const alphaUnreadBefore = (
    await send("GET", "/me/notifications?filter=unread", undefined, cookieA)
  ).json();
  const schedAlphaEv = alphaUnreadBefore.events.find(
    (e: { title: string }) => e.title === "Scheduled Morning Encouragement",
  );
  assert.ok(schedAlphaEv);
  await send("POST", `/me/notifications/${schedAlphaEv.id}/read`, {}, cookieB);
  assert.equal(
    (
      await send("GET", "/me/notifications?filter=unread", undefined, cookieA)
    ).json().unreadCount,
    alphaUnreadBefore.unreadCount,
  );

  // Alpha marks that single event read -> campaign readCount updates while pushProviderAccepted stays exact
  await send("POST", `/me/notifications/${schedAlphaEv.id}/read`, {}, cookieA);
  const schedAfterRead = (
    await send("GET", "/admin/notifications/campaigns", undefined, adminCookie)
  )
    .json()
    .items.find((c: { id: number }) => c.id === schedRes.json().campaign.id);
  assert.equal(schedAfterRead.pushProviderAccepted, 1);
  assert.equal(schedAfterRead.readCount, 1);

  // Alpha marks all remaining notifications read -> auth/me unread badge drops to 0
  const markAllRes = await send(
    "POST",
    "/me/notifications/read-all",
    {},
    cookieA,
  );
  assert.equal(markAllRes.statusCode, 200);
  assert.equal(markAllRes.json().unreadCount, 0);
  assert.equal(
    (await send("GET", "/auth/me", undefined, cookieA)).json()
      .unreadNotificationsCount,
    0,
  );
});

test("Migration 0009 marks pre-existing readers onboarding-completed, defaults announcements off, and supports announcement events", async () => {
  const migFolder = mkdtempSync(join(tmpdir(), "balanced-mig0009-"));
  const migDbPath = join(migFolder, "pre0009.sqlite");
  try {
    const raw = new Database(migDbPath);
    raw.pragma("foreign_keys = ON");
    raw.exec(
      "CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)",
    );
    const migDir = resolve(process.cwd(), "migrations");
    const preMigrations = readdirSync(migDir)
      .filter((f) => f.endsWith(".sql") && f < "0009_")
      .sort();
    for (const file of preMigrations) {
      raw.exec(readFileSync(resolve(migDir, file), "utf8"));
      raw
        .prepare("INSERT INTO schema_migrations VALUES (?, ?)")
        .run(file, "2026-11-10T00:00:00.000Z");
    }

    const pwHash = await hashPassword("Existing-Reader-2026!");
    raw
      .prepare(
        "INSERT INTO users (id, name, email, password_hash, role, status, suspended_reason, created_at, updated_at) VALUES (21, 'Pre Existing Reader', 'pre0009@example.org', ?, 'reader', 'active', '', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z')",
      )
      .run(pwHash);
    raw
      .prepare(
        "INSERT INTO notification_preferences (user_id, updated_at) VALUES (21, '2026-11-10T00:00:00.000Z')",
      )
      .run();
    raw.close();

    const migrated = openDatabase(migDbPath);
    const existingReader = migrated.sqlite
      .prepare("SELECT onboarding_completed_at FROM users WHERE id = 21")
      .get() as { onboarding_completed_at: string | null };
    assert.ok(existingReader.onboarding_completed_at);

    const existingPref = migrated.sqlite
      .prepare(
        "SELECT announcements_enabled FROM notification_preferences WHERE user_id = 21",
      )
      .get() as { announcements_enabled: number };
    assert.equal(existingPref.announcements_enabled, 0);

    migrated.sqlite
      .prepare(
        "INSERT INTO notification_events (user_id, category, title, body, action_url, dedupe_key, push_status, created_at) VALUES (21, 'announcement', 'Migrated Check', 'Supports announcement category', '/library', 'mig0009-ann-1', 'skipped', '2026-11-11T00:00:00.000Z')",
      )
      .run();
    assert.equal(
      (migrated.sqlite.pragma("foreign_key_check") as unknown[]).length,
      0,
    );
    assert.equal(
      migrated.sqlite.pragma("integrity_check", { simple: true }),
      "ok",
    );
    migrated.sqlite.close();
  } finally {
    rmSync(migFolder, { recursive: true, force: true });
  }
});

test("Admin operational improvements: single complimentary grant, revocation, explicit devotional approval, past schedule rejection, and paginated RBAC endpoints", async () => {
  // Register a fresh reader with no paid history
  const regRes = await send("POST", "/auth/register", {
    name: "Ops Regression Reader",
    email: `ops-reader-${Date.now()}@example.org`,
    password: "Reader-Ops-Pass-2027!",
  });
  assert.equal(regRes.statusCode, 200);
  const readerCookie = String(regRes.headers["set-cookie"]).split(";")[0];
  const readerId = regRes.json().user.id as number;

  const revenueBefore = (
    await send("GET", "/admin/overview", undefined, adminCookie)
  ).json().metrics.verifiedRevenueKobo as number;

  // Invalid complimentary grant (short reason) fails with 400 and leaves access ungranted
  const badGrant = await send(
    "POST",
    `/admin/users/${readerId}/online-access/grant`,
    { months: 12, reason: "x" },
    adminCookie,
  );
  assert.equal(badGrant.statusCode, 400);
  const meAfterBadGrant = (await send("GET", "/auth/me", undefined, readerCookie)).json();
  assert.equal(meAfterBadGrant.access.status, "free");

  // Single authoritative 12-month complimentary grant creates no paid transaction or duplicate subscription
  const goodGrant = await send(
    "POST",
    `/admin/users/${readerId}/online-access/grant`,
    { months: 12, reason: "Pastoral scholarship test grant" },
    adminCookie,
  );
  assert.equal(goodGrant.statusCode, 200);
  assert.equal(goodGrant.json().entitlement.status, "active");

  const overviewAfterGrant = (
    await send("GET", "/admin/overview", undefined, adminCookie)
  ).json();
  assert.equal(overviewAfterGrant.metrics.verifiedRevenueKobo, revenueBefore);
  const grantedUserRow = overviewAfterGrant.users.find(
    (u: { id: number }) => u.id === readerId,
  );
  assert.ok(grantedUserRow);
  assert.equal(grantedUserRow.onlineAccessActive, true);
  assert.equal(grantedUserRow.onlineAccessStatus, "active");
  assert.equal(grantedUserRow.accessType, "complimentary");
  assert.equal(grantedUserRow.digitalPurchasesCount, 0);

  // Revoke requires valid reason, revokes entitlement, and rejects double-revocation
  const badRevoke = await send(
    "POST",
    `/admin/users/${readerId}/online-access/revoke`,
    { reason: "x" },
    adminCookie,
  );
  assert.equal(badRevoke.statusCode, 400);

  const revokeRes = await send(
    "POST",
    `/admin/users/${readerId}/online-access/revoke`,
    { reason: "Scholarship ended cleanly" },
    adminCookie,
  );
  assert.equal(revokeRes.statusCode, 200);
  assert.equal(revokeRes.json().entitlement.status, "revoked");

  const meAfterRevoke = (await send("GET", "/auth/me", undefined, readerCookie)).json();
  assert.equal(meAfterRevoke.access.status, "revoked");

  const doubleRevoke = await send(
    "POST",
    `/admin/users/${readerId}/online-access/revoke`,
    { reason: "Duplicate revoke attempt" },
    adminCookie,
  );
  assert.equal(doubleRevoke.statusCode, 400);

  // Explicit editorial approval required before publishing any devotional
  const createUnapprovedPublished = await send(
    "POST",
    "/admin/devotionals",
    {
      date: "2027-07-07",
      title: "Unapproved Publish Attempt",
      theme: "July Theme",
      bibleText: "Psalm 23:1",
      memoryVerse: "The Lord is my shepherd",
      reflection: "Thoughtful devotional reflection body.",
      thinkAbout: "Reflect deeply.",
      prayer: "Lord guide us.",
      challenge: "Encourage someone today.",
      published: true,
      reviewStatus: "pending_review",
    },
    adminCookie,
  );
  assert.equal(createUnapprovedPublished.statusCode, 400);

  const createDraft = await send(
    "POST",
    "/admin/devotionals",
    {
      date: "2027-07-07",
      title: "Editorial Draft For Verification",
      theme: "July Theme",
      bibleText: "Psalm 23:1",
      memoryVerse: "The Lord is my shepherd",
      reflection: "Thoughtful devotional reflection body.",
      thinkAbout: "Reflect deeply.",
      prayer: "Lord guide us.",
      challenge: "Encourage someone today.",
      published: false,
      reviewStatus: "pending_review",
    },
    adminCookie,
  );
  assert.equal(createDraft.statusCode, 200);
  const draftId = createDraft.json().id as number;

  const statusPublishWithoutApproval = await send(
    "PATCH",
    `/admin/devotionals/${draftId}/status`,
    { published: true },
    adminCookie,
  );
  assert.equal(statusPublishWithoutApproval.statusCode, 400);

  const approveOnly = await send(
    "PATCH",
    `/admin/devotionals/${draftId}/status`,
    { reviewStatus: "approved" },
    adminCookie,
  );
  assert.equal(approveOnly.statusCode, 200);
  assert.equal(approveOnly.json().published, false);
  assert.equal(approveOnly.json().reviewStatus, "approved");

  const editorialSummary = (
    await send("GET", "/admin/devotionals/summary", undefined, adminCookie)
  ).json();
  assert.ok(editorialSummary.approvedUnpublishedReadings >= 1);
  assert.ok(Array.isArray(editorialSummary.missingDates));

  const publishApproved = await send(
    "PATCH",
    `/admin/devotionals/${draftId}/status`,
    { published: true, reviewStatus: "approved" },
    adminCookie,
  );
  assert.equal(publishApproved.statusCode, 200);
  assert.equal(publishApproved.json().published, true);

  // Notification campaign rejects scheduledFor in the past
  const pastSchedule = await send(
    "POST",
    "/admin/notifications/campaigns",
    {
      targetType: "individual",
      targetUserId: readerId,
      category: "announcement",
      title: "Past Time Should Fail",
      body: "Testing server future date validation.",
      actionUrl: "/dashboard",
      scheduledFor: "2020-01-01T10:00:00.000Z",
      confirmed: true,
      idempotencyKey: `past-${Date.now()}`,
    },
    adminCookie,
  );
  assert.equal(pastSchedule.statusCode, 400);

  // Paginated operational endpoints work for owner & maintain array compat for unpaginated printed orders
  const readersPaged = (
    await send("GET", "/admin/readers?page=1&limit=5", undefined, adminCookie)
  ).json();
  assert.ok(Array.isArray(readersPaged.items));
  assert.ok(readersPaged.total >= 1);

  const onlinePaged = (
    await send("GET", "/admin/online-access?page=1&limit=5", undefined, adminCookie)
  ).json();
  assert.ok(Array.isArray(onlinePaged.items));

  const paymentsPaged = (
    await send("GET", "/admin/payments?page=1&limit=5", undefined, adminCookie)
  ).json();
  assert.ok(Array.isArray(paymentsPaged.items));

  const inquiriesPaged = (
    await send("GET", "/admin/inquiries?page=1&limit=5", undefined, adminCookie)
  ).json();
  assert.ok(Array.isArray(inquiriesPaged.items));

  const printedLegacy = (
    await send("GET", "/admin/printed-orders", undefined, adminCookie)
  ).json();
  assert.ok(Array.isArray(printedLegacy));

  const printedPaged = (
    await send("GET", "/admin/printed-orders?page=1&limit=5", undefined, adminCookie)
  ).json();
  assert.ok(Array.isArray(printedPaged.items));

  // Role boundary check: create a content_editor and verify restricted endpoints fail 403 and overview scopes cleanly
  const editorEmail = `ed-ops-${Date.now()}@cossyteens.com`;
  const staffCreate = await send(
    "POST",
    "/admin/staff",
    {
      name: "Editorial Helper",
      email: editorEmail,
      role: "content_editor",
      password: "Editor-Strong-Pass-2027!",
    },
    adminCookie,
  );
  assert.equal(staffCreate.statusCode, 200);
  const editorLogin = await send("POST", "/admin/auth/login", {
    email: editorEmail,
    password: "Editor-Strong-Pass-2027!",
  });
  const editorCookie = String(editorLogin.headers["set-cookie"]).split(";")[0];
  const editorMfaEnroll = await send("POST", "/admin/auth/mfa/enroll", {}, editorCookie);
  await send(
    "POST",
    "/admin/auth/mfa/confirm",
    { code: generateTotpCode(editorMfaEnroll.json().manualEntryKey) },
    editorCookie,
  );

  assert.equal(
    (await send("GET", "/admin/readers", undefined, editorCookie)).statusCode,
    403,
  );
  assert.equal(
    (await send("GET", "/admin/payments", undefined, editorCookie)).statusCode,
    403,
  );
  assert.equal(
    (
      await send(
        "POST",
        `/admin/users/${readerId}/online-access/grant`,
        { months: 12, reason: "Unauthorized attempt" },
        editorCookie,
      )
    ).statusCode,
    403,
  );
  const editorOverview = (
    await send("GET", "/admin/overview", undefined, editorCookie)
  ).json();
  assert.deepEqual(editorOverview.users, []);
  assert.deepEqual(editorOverview.payments, []);
  assert.ok(editorOverview.devotionals.length >= 1);
});

