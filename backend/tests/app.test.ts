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
  assert.equal(verifyRes.json().entitlement.status, "active");
  assert.equal(verifyRes.json().entitlement.editionYear, 2027);

  // Buyer can now read non-sample 2027 devotional without a recurring subscription
  const unlockedRes = await send(
    "GET",
    `/devotionals/${lockedEntry.id}`,
    undefined,
    buyerCookie,
  );
  assert.equal(unlockedRes.statusCode, 200);
  assert.equal(unlockedRes.json().reflection, entryFixture.reflection);

  // Overview revenue includes 100,000 kobo subscription + 350,000 kobo digital edition = 450,000 kobo
  const overview = (
    await send("GET", "/admin/overview", undefined, adminCookie)
  ).json();
  assert.equal(overview.metrics.digitalRevenueKobo, 350000);
  assert.equal(overview.metrics.verifiedRevenueKobo, 450000);
  assert.equal(overview.metrics.digitalEditionsSold, 1);

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

  // Admin reconciliation approves and activates entitlement
  const approveRes = await send(
    "POST",
    `/admin/digital-purchases/${purchaseId}/reconcile`,
    { action: "approve", adminNotes: "Confirmed on Access Bank statement" },
    adminCookie,
  );
  assert.equal(approveRes.statusCode, 200);
  assert.equal(
    (await send("GET", "/me/digital-edition", undefined, transferCookie)).json()
      .active,
    true,
  );
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

test("PWA notification preferences, push subscriptions, and daily reminders deduplicate cleanly", async () => {
  const initNotifs = (
    await send("GET", "/me/notifications", undefined, subscriberCookie)
  ).json();
  assert.equal(initNotifs.preferences.dailyReminderEnabled, false);
  assert.equal(initNotifs.pushSubscriptionsCount, 0);

  // Enable daily reminder
  const prefRes = await send(
    "PATCH",
    "/me/notifications/preferences",
    {
      dailyReminderEnabled: true,
      reminderTime: "06:30",
      timezone: "Africa/Lagos",
      subscriptionAlertsEnabled: true,
      purchaseAlertsEnabled: true,
    },
    subscriberCookie,
  );
  assert.equal(prefRes.statusCode, 200);
  assert.equal(prefRes.json().preferences.dailyReminderEnabled, true);

  // Register push subscription
  const subPush = await send(
    "POST",
    "/me/notifications/push-subscribe",
    {
      endpoint: "https://fcm.googleapis.com/fcm/send/mock-endpoint-1",
      p256dhKey: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ",
      authKey: "tBHItJI5svbpez7KI4CCXg",
      userAgent: "Playwright Mobile PWA Test",
    },
    subscriberCookie,
  );
  assert.equal(subPush.statusCode, 200);
  assert.equal(subPush.json().pushSubscriptionsCount, 1);

  // Unmark progress on devotional #1 so today's daily reading reminder is eligible
  const devList = (await send("GET", "/devotionals")).json();
  await send(
    "POST",
    `/me/progress/${devList[0].id}`,
    { completed: false },
    subscriberCookie,
  );

  // Calling GET /me/notifications twice on the same day must not create duplicate daily reminders
  const firstFetch = (
    await send("GET", "/me/notifications", undefined, subscriberCookie)
  ).json();
  const secondFetch = (
    await send("GET", "/me/notifications", undefined, subscriberCookie)
  ).json();
  const dailyReminders = secondFetch.events.filter(
    (e: { category: string }) => e.category === "daily_reminder",
  );
  assert.equal(dailyReminders.length, 1);
  assert.equal(firstFetch.events.length, secondFetch.events.length);
});
