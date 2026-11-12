import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import type { Store } from "../db.js";
import * as s from "../schema.js";
import { HttpError } from "../errors.js";
import {
  assertStrongAdminPassword,
  hashPassword,
  logAdminAudit,
} from "../auth.js";
import { sanitizeProviderError, type EmailService } from "./email.js";
import {
  deriveKeyedSecret,
  sendImmediateTransactionalEmail,
} from "./emailQueue.js";

export type ResetAudienceScope = "reader" | "admin";

export const RESET_CODE_TTL_MS = 10 * 60_000; // 10 minutes
export const RESET_PROOF_TTL_MS = 10 * 60_000; // 10 minutes after code verify
export const RESEND_COOLDOWN_MS = 60_000; // 60 seconds minimum
export const MAX_RESET_ATTEMPTS = 5;
export const MAX_REQUESTS_PER_EMAIL_PER_HOUR = 6;
export const MAX_REQUESTS_PER_IP_PER_HOUR = 30;

function hashResetValue(
  scope: ResetAudienceScope,
  email: string,
  salt: string,
  value: string,
): string {
  const key = deriveKeyedSecret("password_reset");
  return createHmac("sha256", key)
    .update(`${scope}:${email}:${salt}:${value}`)
    .digest("hex");
}

function hashEmailForRateLimit(scope: ResetAudienceScope, email: string): string {
  const key = deriveKeyedSecret("password_reset");
  return createHmac("sha256", key).update(`rate:${scope}:${email}`).digest("hex");
}

function hashIpForRateLimit(ip: string): string {
  return createHash("sha256").update(`ip:${ip}`).digest("hex");
}

function timingSafeHexEquals(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "utf8");
  const b = Buffer.from(bHex, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

function genericForgotPasswordMessage(scope: ResetAudienceScope): string {
  return scope === "admin"
    ? "If an active administrator account exists for that email, a 6-digit verification code has been sent."
    : "If an account exists for that email, we have sent a 6-digit verification code.";
}

export async function requestPasswordResetCode(
  store: Store,
  emailService: EmailService,
  input: {
    scope: ResetAudienceScope;
    email: string;
    ipAddress?: string;
    appBaseUrl: string;
    now?: Date;
  },
) {
  const now = input.now || new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const email = normalizeEmail(input.email);
  const ip =
    String(input.ipAddress || "unknown").trim().slice(0, 120) || "unknown";
  const emailHmac = hashEmailForRateLimit(input.scope, email);
  const ipHash = hashIpForRateLimit(ip);

  const oneHourAgoIso = new Date(nowMs - 60 * 60_000).toISOString();
  const cooldownCutoffIso = new Date(nowMs - RESEND_COOLDOWN_MS).toISOString();

  // Check rate limits uniformly before inspecting user records to avoid account enumeration
  const recentEmailEvents = store.db
    .select()
    .from(s.passwordResetRateEvents)
    .where(
      and(
        eq(s.passwordResetRateEvents.actorType, input.scope),
        eq(s.passwordResetRateEvents.emailHmac, emailHmac),
        gte(s.passwordResetRateEvents.createdAt, oneHourAgoIso),
      ),
    )
    .orderBy(
      desc(s.passwordResetRateEvents.createdAt),
      desc(s.passwordResetRateEvents.id),
    )
    .all();

  if (recentEmailEvents.length > 0) {
    const latest = recentEmailEvents[0];
    if (latest.createdAt > cooldownCutoffIso) {
      const elapsedMs = nowMs - new Date(latest.createdAt).getTime();
      const waitSec = Math.max(
        1,
        Math.ceil((RESEND_COOLDOWN_MS - elapsedMs) / 1000),
      );
      throw new HttpError(
        429,
        `Please wait ${waitSec} second${waitSec === 1 ? "" : "s"} before requesting another verification code.`,
      );
    }
    if (recentEmailEvents.length >= MAX_REQUESTS_PER_EMAIL_PER_HOUR) {
      throw new HttpError(
        429,
        "Too many verification code requests for this email. Please wait before trying again.",
      );
    }
  }

  const recentIpEvents = store.db
    .select({ id: s.passwordResetRateEvents.id })
    .from(s.passwordResetRateEvents)
    .where(
      and(
        eq(s.passwordResetRateEvents.actorType, input.scope),
        eq(s.passwordResetRateEvents.ipHash, ipHash),
        gte(s.passwordResetRateEvents.createdAt, oneHourAgoIso),
      ),
    )
    .all();

  if (recentIpEvents.length >= MAX_REQUESTS_PER_IP_PER_HOUR) {
    throw new HttpError(
      429,
      "Too many password reset attempts from this network. Please wait before trying again.",
    );
  }

  const rateEvent = store.db
    .insert(s.passwordResetRateEvents)
    .values({
      actorType: input.scope,
      emailHmac,
      ipHash,
      createdAt: nowIso,
    })
    .returning({ id: s.passwordResetRateEvents.id })
    .get();

  let targetAccount:
    | { id: number; name: string; email: string; role?: string }
    | undefined;

  if (input.scope === "reader") {
    const user = store.db
      .select({
        id: s.users.id,
        name: s.users.name,
        email: s.users.email,
        status: s.users.status,
      })
      .from(s.users)
      .where(eq(s.users.email, email))
      .get();
    if (user && user.status === "active") {
      targetAccount = { id: user.id, name: user.name, email: user.email };
    }
  } else {
    const admin = store.db
      .select({
        id: s.adminUsers.id,
        name: s.adminUsers.name,
        email: s.adminUsers.email,
        role: s.adminUsers.role,
        status: s.adminUsers.status,
      })
      .from(s.adminUsers)
      .where(eq(s.adminUsers.email, email))
      .get();
    if (admin && admin.status === "active") {
      targetAccount = {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      };
    }
  }

  if (!targetAccount) {
    return {
      ok: true,
      cooldownSeconds: Math.round(RESEND_COOLDOWN_MS / 1000),
      expiresInSeconds: Math.round(RESET_CODE_TTL_MS / 1000),
      message: genericForgotPasswordMessage(input.scope),
    };
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const challengeSalt = randomBytes(16).toString("hex");
  const codeHmac = hashResetValue(input.scope, email, challengeSalt, code);
  const expiresAtIso = new Date(nowMs + RESET_CODE_TTL_MS).toISOString();

  const challenge = store.sqlite.transaction(() => {
    // Invalidate all prior active/verified reset challenges for this email & actor scope
    store.db
      .update(s.passwordResetCodes)
      .set({
        status: "invalidated",
        invalidatedAt: nowIso,
      })
      .where(
        and(
          eq(s.passwordResetCodes.actorType, input.scope),
          eq(s.passwordResetCodes.email, email),
          isNull(s.passwordResetCodes.usedAt),
          isNull(s.passwordResetCodes.invalidatedAt),
        ),
      )
      .run();

    const row = store.db
      .insert(s.passwordResetCodes)
      .values({
        actorType: input.scope,
        userId: input.scope === "reader" ? targetAccount.id : null,
        adminId: input.scope === "admin" ? targetAccount.id : null,
        email,
        codeHmac,
        challengeSalt,
        proofTokenHash: null,
        attemptCount: 0,
        maxAttempts: MAX_RESET_ATTEMPTS,
        status: "active",
        requestIp: ipHash.slice(0, 24),
        expiresAt: expiresAtIso,
        verifiedAt: null,
        usedAt: null,
        invalidatedAt: null,
        createdAt: nowIso,
      })
      .returning()
      .get();

    if (input.scope === "admin") {
      logAdminAudit(
        store,
        {
          id: targetAccount.id,
          name: targetAccount.name,
          email: targetAccount.email,
          role: targetAccount.role || "admin",
        },
        "Requested 6-digit password reset verification code",
        "admin_auth",
        targetAccount.id,
        nowIso,
      );
    }

    return row;
  })();

  // Dispatch immediately without persisting plaintext code in any DB table or log
  const delivery = await sendImmediateTransactionalEmail(store, emailService, {
    userId: input.scope === "reader" ? targetAccount.id : null,
    adminId: input.scope === "admin" ? targetAccount.id : null,
    recipientEmail: targetAccount.email,
    recipientName: targetAccount.name,
    templateId: "password_reset_code",
    dedupeKey: `reset_code_${input.scope}_${challenge.id}`,
    redactCodeInAudit: true,
    now,
    payload: {
      recipientName: targetAccount.name,
      code,
      expiresMinutes: Math.round(RESET_CODE_TTL_MS / 60_000),
      audience: input.scope,
      appBaseUrl: input.appBaseUrl,
    },
  });

  if (!delivery.delivered) {
    store.sqlite.transaction(() => {
      store.db
        .update(s.passwordResetCodes)
        .set({
          status: "invalidated",
          invalidatedAt: nowIso,
        })
        .where(eq(s.passwordResetCodes.id, challenge.id))
        .run();

      if (!delivery.rateLimited && rateEvent?.id) {
        store.db
          .delete(s.passwordResetRateEvents)
          .where(eq(s.passwordResetRateEvents.id, rateEvent.id))
          .run();
      }
    })();

    const safeDetail = sanitizeProviderError(delivery.error, "");
    if (delivery.rateLimited || delivery.statusCode === 429) {
      throw new HttpError(
        429,
        safeDetail ||
          "Email sending capacity is temporarily exhausted. Please wait before trying again.",
      );
    }
    throw new HttpError(
      503,
      safeDetail
        ? `Unable to send your verification code right now: ${safeDetail}`
        : "Unable to send your verification code right now. Please try again shortly or contact support.",
    );
  }

  return {
    ok: true,
    cooldownSeconds: Math.round(RESEND_COOLDOWN_MS / 1000),
    expiresInSeconds: Math.round(RESET_CODE_TTL_MS / 1000),
    message: genericForgotPasswordMessage(input.scope),
  };
}

export function verifyPasswordResetCode(
  store: Store,
  input: {
    scope: ResetAudienceScope;
    email: string;
    code: string;
    now?: Date;
  },
) {
  const now = input.now || new Date();
  const nowIso = now.toISOString();
  const email = normalizeEmail(input.email);
  const code = String(input.code || "").replace(/\D/g, "");

  if (code.length !== 6) {
    throw new HttpError(
      400,
      "Enter the 6-digit verification code from your email.",
    );
  }

  const active = store.db
    .select()
    .from(s.passwordResetCodes)
    .where(
      and(
        eq(s.passwordResetCodes.actorType, input.scope),
        eq(s.passwordResetCodes.email, email),
        isNull(s.passwordResetCodes.usedAt),
        isNull(s.passwordResetCodes.invalidatedAt),
      ),
    )
    .orderBy(
      desc(s.passwordResetCodes.createdAt),
      desc(s.passwordResetCodes.id),
    )
    .get();

  if (!active || active.expiresAt <= nowIso) {
    throw new HttpError(
      400,
      "Verification code is invalid or has expired. Request a new code.",
    );
  }

  if (
    active.status === "locked" ||
    active.attemptCount >= active.maxAttempts
  ) {
    throw new HttpError(
      429,
      "Too many incorrect verification attempts. Please request a new 6-digit code.",
    );
  }

  const candidateHmac = hashResetValue(
    input.scope,
    email,
    active.challengeSalt,
    code,
  );
  const matched = timingSafeHexEquals(candidateHmac, active.codeHmac);

  if (!matched) {
    const nextAttempts = active.attemptCount + 1;
    const locked = nextAttempts >= active.maxAttempts;
    store.db
      .update(s.passwordResetCodes)
      .set({
        attemptCount: nextAttempts,
        status: locked ? "locked" : active.status,
      })
      .where(eq(s.passwordResetCodes.id, active.id))
      .run();

    if (locked) {
      throw new HttpError(
        429,
        "Maximum verification attempts reached for this code. Request a new 6-digit code.",
      );
    }

    const remaining = active.maxAttempts - nextAttempts;
    throw new HttpError(
      400,
      `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
    );
  }

  const resetProofToken = randomBytes(32).toString("hex");
  const proofTokenHash = hashResetValue(
    input.scope,
    email,
    active.challengeSalt,
    resetProofToken,
  );

  store.db
    .update(s.passwordResetCodes)
    .set({
      status: "verified",
      verifiedAt: nowIso,
      proofTokenHash,
    })
    .where(eq(s.passwordResetCodes.id, active.id))
    .run();

  return {
    verified: true,
    resetProofToken,
    expiresInSeconds: Math.round(RESET_PROOF_TTL_MS / 1000),
  };
}

export async function completePasswordResetWithProof(
  store: Store,
  emailService: EmailService,
  input: {
    scope: ResetAudienceScope;
    email: string;
    resetProofToken: string;
    newPassword: string;
    appBaseUrl: string;
    now?: Date;
  },
) {
  const now = input.now || new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const email = normalizeEmail(input.email);
  const rawProof = String(input.resetProofToken || "").trim();

  if (!rawProof || rawProof.length < 32) {
    throw new HttpError(
      400,
      "Verification proof is missing or invalid. Verify your 6-digit code first.",
    );
  }

  if (input.scope === "admin") {
    assertStrongAdminPassword(input.newPassword);
  }

  const candidateChallenges = store.db
    .select()
    .from(s.passwordResetCodes)
    .where(
      and(
        eq(s.passwordResetCodes.actorType, input.scope),
        eq(s.passwordResetCodes.email, email),
        eq(s.passwordResetCodes.status, "verified"),
        isNull(s.passwordResetCodes.usedAt),
        isNull(s.passwordResetCodes.invalidatedAt),
      ),
    )
    .orderBy(
      desc(s.passwordResetCodes.createdAt),
      desc(s.passwordResetCodes.id),
    )
    .all();

  const matchingChallenge = candidateChallenges.find((row) => {
    if (!row.verifiedAt || !row.proofTokenHash) return false;
    const verifiedAtMs = new Date(row.verifiedAt).getTime();
    if (
      Number.isNaN(verifiedAtMs) ||
      verifiedAtMs + RESET_PROOF_TTL_MS <= nowMs
    ) {
      return false;
    }
    const expectedProofHash = hashResetValue(
      input.scope,
      email,
      row.challengeSalt,
      rawProof,
    );
    return timingSafeHexEquals(expectedProofHash, row.proofTokenHash);
  });

  if (!matchingChallenge) {
    throw new HttpError(
      400,
      "Verification session has expired or was already used. Request a new code.",
    );
  }

  const passwordHash = await hashPassword(input.newPassword);

  let notifyAccount: { id: number; name: string; email: string } | null = null;

  store.sqlite.transaction(() => {
    const freshRow = store.db
      .select()
      .from(s.passwordResetCodes)
      .where(
        and(
          eq(s.passwordResetCodes.id, matchingChallenge.id),
          eq(s.passwordResetCodes.status, "verified"),
          isNull(s.passwordResetCodes.usedAt),
          isNull(s.passwordResetCodes.invalidatedAt),
        ),
      )
      .get();

    if (!freshRow) {
      throw new HttpError(
        400,
        "Verification session has already been used. Request a new code.",
      );
    }

    if (input.scope === "reader") {
      if (!freshRow.userId) {
        throw new HttpError(400, "Account not found for password reset.");
      }
      const user = store.db
        .select({ id: s.users.id, name: s.users.name, email: s.users.email })
        .from(s.users)
        .where(eq(s.users.id, freshRow.userId))
        .get();
      if (!user) {
        throw new HttpError(400, "Account not found for password reset.");
      }

      store.db
        .update(s.users)
        .set({ passwordHash, updatedAt: nowIso })
        .where(eq(s.users.id, user.id))
        .run();

      store.db
        .delete(s.sessions)
        .where(eq(s.sessions.userId, user.id))
        .run();

      notifyAccount = user;
    } else {
      if (!freshRow.adminId) {
        throw new HttpError(400, "Administrator account not found.");
      }
      const admin = store.db
        .select({
          id: s.adminUsers.id,
          name: s.adminUsers.name,
          email: s.adminUsers.email,
          role: s.adminUsers.role,
        })
        .from(s.adminUsers)
        .where(eq(s.adminUsers.id, freshRow.adminId))
        .get();
      if (!admin) {
        throw new HttpError(400, "Administrator account not found.");
      }

      // Preserve MFA settings untouched while updating passwordHash and clearing lockouts
      store.db
        .update(s.adminUsers)
        .set({
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
          updatedAt: nowIso,
        })
        .where(eq(s.adminUsers.id, admin.id))
        .run();

      store.db
        .delete(s.adminSessions)
        .where(eq(s.adminSessions.adminId, admin.id))
        .run();

      logAdminAudit(
        store,
        admin,
        "Completed password reset via 6-digit email verification code (all admin sessions revoked; MFA remains mandatory)",
        "admin_auth",
        admin.id,
        nowIso,
      );

      notifyAccount = { id: admin.id, name: admin.name, email: admin.email };
    }

    // Consume this challenge and invalidate any remaining active/verified challenges
    store.db
      .update(s.passwordResetCodes)
      .set({
        status: "used",
        usedAt: nowIso,
      })
      .where(eq(s.passwordResetCodes.id, freshRow.id))
      .run();

    store.db
      .update(s.passwordResetCodes)
      .set({
        status: "invalidated",
        invalidatedAt: nowIso,
      })
      .where(
        and(
          eq(s.passwordResetCodes.actorType, input.scope),
          eq(s.passwordResetCodes.email, email),
          isNull(s.passwordResetCodes.usedAt),
          isNull(s.passwordResetCodes.invalidatedAt),
        ),
      )
      .run();
  })();

  if (notifyAccount) {
    const account = notifyAccount as {
      id: number;
      name: string;
      email: string;
    };
    await sendImmediateTransactionalEmail(store, emailService, {
      userId: input.scope === "reader" ? account.id : null,
      adminId: input.scope === "admin" ? account.id : null,
      recipientEmail: account.email,
      recipientName: account.name,
      templateId: "password_changed",
      dedupeKey: `password_changed_${input.scope}_${matchingChallenge.id}`,
      payload: {
        recipientName: account.name,
        changedAtIso: nowIso,
        audience: input.scope,
        appBaseUrl: input.appBaseUrl,
      },
    });
  }

  return {
    ok: true,
    scope: input.scope,
  };
}
