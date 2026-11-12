import type { FastifyInstance } from "fastify";
import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { Store } from "../db.js";
import * as s from "../schema.js";
import {
  ADMIN_SESSION_COOKIE,
  assertStrongAdminPassword,
  clearAdminCookie,
  establishAdminSession,
  hashPassword,
  logAdminAudit,
  publicAdmin,
  requireAdmin,
  requireAdminSessionPendingOk,
  tokenHash,
  verifyPassword,
} from "../auth.js";
import { HttpError } from "../errors.js";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordWithCodeSchema,
  verifyResetCodeSchema,
} from "../validation.js";
import type { EmailService } from "../services/email.js";
import {
  enqueueEmail,
  processEmailQueueBatch,
} from "../services/emailQueue.js";
import {
  completePasswordResetWithProof,
  requestPasswordResetCode,
  verifyPasswordResetCode,
} from "../services/passwordReset.js";
import {
  buildOtpAuthUri,
  decryptMfaSecret,
  encryptMfaSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotpCode,
} from "../services/mfa.js";

const mfaCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6, "Enter the 6-digit authenticator code.")
    .max(16),
});

const mfaEnrollSchema = z
  .object({
    currentPassword: z.string().min(1).max(128).optional(),
  })
  .optional();

const mfaRecoverSchema = z.object({
  recoveryCode: z
    .string()
    .trim()
    .min(6, "Enter a valid backup recovery code.")
    .max(64),
});

const mfaRegenerateSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required.").max(128),
});

const adminPasswordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required.").max(128),
  newPassword: z.string().min(12).max(128),
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export function registerAdminAuthRoutes(
  app: FastifyInstance,
  prefix: string,
  store: Store,
  emailService: EmailService,
  options: {
    isProduction: boolean;
    adminOrigin: string;
    mfaEncryptionKey: string;
    adminSessionIdleMinutes: number;
    adminSessionMaxHours: number;
  },
) {
  const { db } = store;

  const sanitizeForResponse = (
    admin: typeof s.adminUsers.$inferSelect,
    mfaVerified: boolean,
  ) => {
    const base = publicAdmin(admin, mfaVerified);
    return {
      ...base,
      permissions: base.mfaEnabled && base.mfaVerified ? base.permissions : [],
    };
  };

  app.get(prefix + "/admin/auth/me", async (req) => {
    if (!req.admin) {
      return {
        admin: null,
        mfaEnrollmentRequired: false,
        mfaChallengeRequired: false,
        unusedRecoveryCodesCount: 0,
        idleTimeoutMinutes: options.adminSessionIdleMinutes,
      };
    }

    const fullyVerified = req.admin.mfaEnabled && req.admin.mfaVerified;
    const unusedRecoveryCodesCount = fullyVerified
      ? db
          .select()
          .from(s.adminMfaRecoveryCodes)
          .where(
            and(
              eq(s.adminMfaRecoveryCodes.adminId, req.admin.id),
              isNull(s.adminMfaRecoveryCodes.usedAt),
            ),
          )
          .all().length
      : 0;

    return {
      admin: {
        ...req.admin,
        permissions: fullyVerified ? req.admin.permissions : [],
      },
      mfaEnrollmentRequired: !req.admin.mfaEnabled,
      mfaChallengeRequired: req.admin.mfaEnabled && !req.admin.mfaVerified,
      unusedRecoveryCodesCount,
      idleTimeoutMinutes: options.adminSessionIdleMinutes,
    };
  });

  app.post(
    prefix + "/admin/auth/login",
    { config: { rateLimit: { max: 30, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const input = loginSchema.parse(req.body);
      const admin = db
        .select()
        .from(s.adminUsers)
        .where(eq(s.adminUsers.email, input.email))
        .get();

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      if (admin?.lockedUntil && admin.lockedUntil > nowIso) {
        await verifyPassword(
          input.password,
          "00000000000000000000000000000000:" + "00".repeat(64),
        );
        throw new HttpError(
          423,
          "This administrator account is temporarily locked after multiple failed attempts. Try again in a few minutes or reset your password.",
        );
      }

      const valid = await verifyPassword(
        input.password,
        admin?.passwordHash ||
          "00000000000000000000000000000000:" + "00".repeat(64),
      );

      if (!admin || !valid) {
        if (admin) {
          const attempts = admin.failedLoginAttempts + 1;
          const lockUntil =
            attempts >= MAX_FAILED_ATTEMPTS
              ? new Date(nowMs + LOCKOUT_MINUTES * 60_000).toISOString()
              : null;
          db.update(s.adminUsers)
            .set({
              failedLoginAttempts: attempts,
              lockedUntil: lockUntil,
              updatedAt: nowIso,
            })
            .where(eq(s.adminUsers.id, admin.id))
            .run();
          if (lockUntil) {
            logAdminAudit(
              store,
              {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                role: admin.role,
              },
              `Locked administrator account after ${attempts} failed login attempts`,
              "admin_auth",
              admin.id,
              nowIso,
            );
          }
        }
        throw new HttpError(401, "Administrator email or password is incorrect.");
      }

      if (admin.status === "suspended") {
        logAdminAudit(
          store,
          {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: admin.role,
          },
          "Blocked login attempt on suspended administrator account",
          "admin_auth",
          admin.id,
          nowIso,
        );
        throw new HttpError(
          403,
          "This administrator account has been suspended.",
        );
      }

      const updated = db
        .update(s.adminUsers)
        .set({
          failedLoginAttempts: 0,
          lockedUntil: null,
          updatedAt: nowIso,
        })
        .where(eq(s.adminUsers.id, admin.id))
        .returning()
        .get();

      await establishAdminSession(store, updated, req, reply, {
        isProduction: options.isProduction,
        maxHours: options.adminSessionMaxHours,
        mfaVerified: false,
      });

      logAdminAudit(
        store,
        {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          role: updated.role,
        },
        updated.mfaEnabled
          ? "Verified administrator password; awaiting MFA verification"
          : "Signed in for mandatory initial MFA enrollment",
        "admin_auth",
        updated.id,
        nowIso,
      );

      return {
        admin: sanitizeForResponse(updated, false),
        nextStep: updated.mfaEnabled ? "verify_mfa" : "enroll_mfa",
      };
    },
  );

  app.post(
    prefix + "/admin/auth/mfa/enroll",
    { config: { rateLimit: { max: 12, timeWindow: "15 minutes" } } },
    async (req) => {
      const sessionAdmin = requireAdminSessionPendingOk(req);
      const body = mfaEnrollSchema.parse(req.body);
      const row = db
        .select()
        .from(s.adminUsers)
        .where(eq(s.adminUsers.id, sessionAdmin.id))
        .get();
      if (!row) throw new HttpError(404, "Administrator account not found.");

      if (row.mfaEnabled) {
        if (!sessionAdmin.mfaVerified) {
          throw new HttpError(
            403,
            "Complete existing MFA verification before rotating your authenticator.",
          );
        }
        if (!body?.currentPassword) {
          throw new HttpError(
            400,
            "Confirm your current password to generate a new authenticator secret.",
          );
        }
        const ok = await verifyPassword(body.currentPassword, row.passwordHash);
        if (!ok) {
          throw new HttpError(401, "Current password is incorrect.");
        }
      }

      const secret = generateTotpSecret();
      const pendingEnc = encryptMfaSecret(
        secret,
        options.mfaEncryptionKey,
        options.isProduction,
      );
      const now = new Date().toISOString();

      db.update(s.adminUsers)
        .set({
          mfaPendingSecretEnc: pendingEnc,
          updatedAt: now,
        })
        .where(eq(s.adminUsers.id, row.id))
        .run();

      return {
        otpauthUri: buildOtpAuthUri({
          secret,
          email: row.email,
        }),
        manualEntryKey: secret,
        issuer: "The Balanced Life Admin",
        accountEmail: row.email,
      };
    },
  );

  app.post(
    prefix + "/admin/auth/mfa/confirm",
    { config: { rateLimit: { max: 15, timeWindow: "15 minutes" } } },
    async (req) => {
      const sessionAdmin = requireAdminSessionPendingOk(req);
      const input = mfaCodeSchema.parse(req.body);
      const row = db
        .select()
        .from(s.adminUsers)
        .where(eq(s.adminUsers.id, sessionAdmin.id))
        .get();
      if (!row) throw new HttpError(404, "Administrator account not found.");

      if (row.mfaEnabled && !sessionAdmin.mfaVerified) {
        throw new HttpError(
          403,
          "Complete existing MFA verification before changing your authenticator.",
        );
      }

      if (!row.mfaPendingSecretEnc) {
        throw new HttpError(
          400,
          "Start MFA setup first to generate an authenticator secret.",
        );
      }

      const secret = decryptMfaSecret(
        row.mfaPendingSecretEnc,
        options.mfaEncryptionKey,
        options.isProduction,
      );
      if (!verifyTotpCode(secret, input.code)) {
        throw new HttpError(
          400,
          "Invalid verification code. Confirm your authenticator clock is accurate and try again.",
        );
      }

      const recoveryCodes = generateRecoveryCodes(8);
      const now = new Date().toISOString();

      const updated = store.sqlite.transaction(() => {
        const nextAdmin = db
          .update(s.adminUsers)
          .set({
            mfaEnabled: true,
            mfaSecretEnc: row.mfaPendingSecretEnc,
            mfaPendingSecretEnc: null,
            mfaVerifiedAt: now,
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastActiveAt: now,
            updatedAt: now,
          })
          .where(eq(s.adminUsers.id, row.id))
          .returning()
          .get();

        db.delete(s.adminMfaRecoveryCodes)
          .where(eq(s.adminMfaRecoveryCodes.adminId, row.id))
          .run();

        for (const code of recoveryCodes) {
          db.insert(s.adminMfaRecoveryCodes)
            .values({
              adminId: row.id,
              codeHash: hashRecoveryCode(code),
              usedAt: null,
              createdAt: now,
            })
            .run();
        }

        if (req.adminSessionTokenHash) {
          db.update(s.adminSessions)
            .set({ mfaVerified: true, lastActivityAt: now })
            .where(eq(s.adminSessions.tokenHash, req.adminSessionTokenHash))
            .run();
        }

        logAdminAudit(
          store,
          {
            id: nextAdmin.id,
            name: nextAdmin.name,
            email: nextAdmin.email,
            role: nextAdmin.role,
          },
          "Enabled authenticator MFA and generated single-use backup recovery codes",
          "admin_auth",
          nextAdmin.id,
          now,
        );

        return nextAdmin;
      })();

      return {
        admin: publicAdmin(updated, true),
        recoveryCodes,
      };
    },
  );

  app.post(
    prefix + "/admin/auth/mfa/verify",
    { config: { rateLimit: { max: 12, timeWindow: "15 minutes" } } },
    async (req) => {
      const sessionAdmin = requireAdminSessionPendingOk(req);
      const input = mfaCodeSchema.parse(req.body);
      const row = db
        .select()
        .from(s.adminUsers)
        .where(eq(s.adminUsers.id, sessionAdmin.id))
        .get();
      if (!row || !row.mfaEnabled || !row.mfaSecretEnc) {
        throw new HttpError(
          400,
          "Authenticator MFA is not enrolled on this account yet.",
        );
      }

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      if (row.lockedUntil && row.lockedUntil > nowIso) {
        throw new HttpError(
          423,
          "Too many failed verification attempts. Try again later or reset your password.",
        );
      }

      const secret = decryptMfaSecret(
        row.mfaSecretEnc,
        options.mfaEncryptionKey,
        options.isProduction,
      );
      if (!verifyTotpCode(secret, input.code)) {
        const attempts = row.failedLoginAttempts + 1;
        const lockUntil =
          attempts >= MAX_FAILED_ATTEMPTS
            ? new Date(nowMs + LOCKOUT_MINUTES * 60_000).toISOString()
            : null;
        db.update(s.adminUsers)
          .set({
            failedLoginAttempts: attempts,
            lockedUntil: lockUntil,
            updatedAt: nowIso,
          })
          .where(eq(s.adminUsers.id, row.id))
          .run();
        throw new HttpError(401, "Invalid authentication code.");
      }

      const updated = store.sqlite.transaction(() => {
        const nextAdmin = db
          .update(s.adminUsers)
          .set({
            mfaVerifiedAt: nowIso,
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastActiveAt: nowIso,
            updatedAt: nowIso,
          })
          .where(eq(s.adminUsers.id, row.id))
          .returning()
          .get();

        if (req.adminSessionTokenHash) {
          db.update(s.adminSessions)
            .set({ mfaVerified: true, lastActivityAt: nowIso })
            .where(eq(s.adminSessions.tokenHash, req.adminSessionTokenHash))
            .run();
        }

        logAdminAudit(
          store,
          {
            id: nextAdmin.id,
            name: nextAdmin.name,
            email: nextAdmin.email,
            role: nextAdmin.role,
          },
          "Completed administrator MFA verification",
          "admin_auth",
          nextAdmin.id,
          nowIso,
        );
        return nextAdmin;
      })();

      return { admin: publicAdmin(updated, true) };
    },
  );

  app.post(
    prefix + "/admin/auth/mfa/recover",
    { config: { rateLimit: { max: 6, timeWindow: "15 minutes" } } },
    async (req) => {
      const sessionAdmin = requireAdminSessionPendingOk(req);
      const input = mfaRecoverSchema.parse(req.body);
      const row = db
        .select()
        .from(s.adminUsers)
        .where(eq(s.adminUsers.id, sessionAdmin.id))
        .get();
      if (!row || !row.mfaEnabled) {
        throw new HttpError(400, "MFA is not enabled on this account.");
      }

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      if (row.lockedUntil && row.lockedUntil > nowIso) {
        throw new HttpError(
          423,
          "This administrator account is temporarily locked. Try again later.",
        );
      }

      const candidateHash = hashRecoveryCode(input.recoveryCode);
      const matchingCode = db
        .select()
        .from(s.adminMfaRecoveryCodes)
        .where(
          and(
            eq(s.adminMfaRecoveryCodes.adminId, row.id),
            eq(s.adminMfaRecoveryCodes.codeHash, candidateHash),
            isNull(s.adminMfaRecoveryCodes.usedAt),
          ),
        )
        .get();

      if (!matchingCode) {
        const attempts = row.failedLoginAttempts + 1;
        const lockUntil =
          attempts >= MAX_FAILED_ATTEMPTS
            ? new Date(nowMs + LOCKOUT_MINUTES * 60_000).toISOString()
            : null;
        db.update(s.adminUsers)
          .set({
            failedLoginAttempts: attempts,
            lockedUntil: lockUntil,
            updatedAt: nowIso,
          })
          .where(eq(s.adminUsers.id, row.id))
          .run();
        throw new HttpError(
          401,
          "Invalid or already used MFA recovery code.",
        );
      }

      const result = store.sqlite.transaction(() => {
        db.update(s.adminMfaRecoveryCodes)
          .set({ usedAt: nowIso })
          .where(eq(s.adminMfaRecoveryCodes.id, matchingCode.id))
          .run();

        const nextAdmin = db
          .update(s.adminUsers)
          .set({
            mfaVerifiedAt: nowIso,
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastActiveAt: nowIso,
            updatedAt: nowIso,
          })
          .where(eq(s.adminUsers.id, row.id))
          .returning()
          .get();

        if (req.adminSessionTokenHash) {
          db.update(s.adminSessions)
            .set({ mfaVerified: true, lastActivityAt: nowIso })
            .where(eq(s.adminSessions.tokenHash, req.adminSessionTokenHash))
            .run();
        }

        const remaining = db
          .select()
          .from(s.adminMfaRecoveryCodes)
          .where(
            and(
              eq(s.adminMfaRecoveryCodes.adminId, row.id),
              isNull(s.adminMfaRecoveryCodes.usedAt),
            ),
          )
          .all().length;

        logAdminAudit(
          store,
          {
            id: nextAdmin.id,
            name: nextAdmin.name,
            email: nextAdmin.email,
            role: nextAdmin.role,
          },
          `Verified administrator session using single-use backup recovery code (${remaining} remaining)`,
          "admin_auth",
          nextAdmin.id,
          nowIso,
        );

        return { nextAdmin, remaining };
      })();

      return {
        admin: publicAdmin(result.nextAdmin, true),
        remainingRecoveryCodes: result.remaining,
      };
    },
  );

  app.post(
    prefix + "/admin/auth/mfa/recovery-codes/regenerate",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req) => {
      const admin = requireAdmin(req);
      const input = mfaRegenerateSchema.parse(req.body);
      const row = db
        .select()
        .from(s.adminUsers)
        .where(eq(s.adminUsers.id, admin.id))
        .get();
      if (!row) throw new HttpError(404, "Administrator account not found.");

      const ok = await verifyPassword(input.currentPassword, row.passwordHash);
      if (!ok) {
        throw new HttpError(401, "Current password is incorrect.");
      }

      const recoveryCodes = generateRecoveryCodes(8);
      const now = new Date().toISOString();

      store.sqlite.transaction(() => {
        db.delete(s.adminMfaRecoveryCodes)
          .where(eq(s.adminMfaRecoveryCodes.adminId, admin.id))
          .run();
        for (const code of recoveryCodes) {
          db.insert(s.adminMfaRecoveryCodes)
            .values({
              adminId: admin.id,
              codeHash: hashRecoveryCode(code),
              usedAt: null,
              createdAt: now,
            })
            .run();
        }
        logAdminAudit(
          store,
          {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: admin.role,
          },
          "Regenerated single-use MFA backup recovery codes",
          "admin_auth",
          admin.id,
          now,
        );
      })();

      return { recoveryCodes };
    },
  );

  app.post(prefix + "/admin/auth/logout", async (req, reply) => {
    const cookieToken = req.cookies[ADMIN_SESSION_COOKIE];
    if (cookieToken) {
      db.delete(s.adminSessions)
        .where(eq(s.adminSessions.tokenHash, tokenHash(cookieToken)))
        .run();
    }
    if (req.admin) {
      logAdminAudit(
        store,
        {
          id: req.admin.id,
          name: req.admin.name,
          email: req.admin.email,
          role: req.admin.role,
        },
        "Signed out of administrator session",
        "admin_auth",
        req.admin.id,
      );
    }
    clearAdminCookie(reply, options.isProduction);
    return { ok: true };
  });

  app.post(prefix + "/admin/auth/logout-all", async (req, reply) => {
    const admin = requireAdminSessionPendingOk(req);
    db.delete(s.adminSessions)
      .where(eq(s.adminSessions.adminId, admin.id))
      .run();
    logAdminAudit(
      store,
      {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
      "Revoked all active administrator sessions",
      "admin_auth",
      admin.id,
    );
    clearAdminCookie(reply, options.isProduction);
    return { ok: true };
  });

  app.get(prefix + "/admin/auth/sessions", async (req) => {
    const admin = requireAdmin(req);
    const now = new Date().toISOString();
    const rows = db
      .select()
      .from(s.adminSessions)
      .where(
        and(
          eq(s.adminSessions.adminId, admin.id),
          gt(s.adminSessions.expiresAt, now),
        ),
      )
      .orderBy(desc(s.adminSessions.lastActivityAt))
      .all();

    return {
      sessions: rows.map((row) => ({
        sessionId: row.tokenHash.slice(0, 12),
        current: row.tokenHash === req.adminSessionTokenHash,
        mfaVerified: Boolean(row.mfaVerified),
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        lastActivityAt: row.lastActivityAt,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
      })),
    };
  });

  app.post(
    prefix + "/admin/auth/forgot-password",
    { config: { rateLimit: { max: 12, timeWindow: "15 minutes" } } },
    async (req) => {
      const input = forgotPasswordSchema.parse(req.body);
      if (!emailService.configured) {
        throw new HttpError(
          503,
          "Automated password recovery emails are not configured in this environment. Configure EMAIL_PROVIDER or use the server CLI administrator recovery tool.",
        );
      }

      return requestPasswordResetCode(store, emailService, {
        scope: "admin",
        email: input.email,
        ipAddress: req.ip,
        appBaseUrl: options.adminOrigin,
      });
    },
  );

  app.post(
    prefix + "/admin/auth/verify-reset-code",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (req) => {
      const input = verifyResetCodeSchema.parse(req.body);
      return verifyPasswordResetCode(store, {
        scope: "admin",
        email: input.email,
        code: input.code,
      });
    },
  );

  app.post(
    prefix + "/admin/auth/reset-password",
    { config: { rateLimit: { max: 12, timeWindow: "15 minutes" } } },
    async (req) => {
      const input = resetPasswordWithCodeSchema.parse(req.body);
      await completePasswordResetWithProof(store, emailService, {
        scope: "admin",
        email: input.email,
        resetProofToken: input.resetProofToken,
        newPassword: input.password,
        appBaseUrl: options.adminOrigin,
      });

      return {
        ok: true,
        message:
          "Your administrator password has been updated. Sign in with your new password and authenticator.",
      };
    },
  );

  app.post(prefix + "/admin/auth/change-password", async (req) => {
    const admin = requireAdmin(req);
    const input = adminPasswordChangeSchema.parse(req.body);
    assertStrongAdminPassword(input.newPassword);

    const row = db
      .select()
      .from(s.adminUsers)
      .where(eq(s.adminUsers.id, admin.id))
      .get();
    if (!row) throw new HttpError(404, "Administrator account not found.");

    const valid = await verifyPassword(input.currentPassword, row.passwordHash);
    if (!valid) {
      throw new HttpError(401, "Your current password is incorrect.");
    }

    const now = new Date().toISOString();
    const newHash = await hashPassword(input.newPassword);
    store.sqlite.transaction(() => {
      db.update(s.adminUsers)
        .set({ passwordHash: newHash, updatedAt: now })
        .where(eq(s.adminUsers.id, admin.id))
        .run();

      // Revoke all other admin sessions while keeping current verified session intact
      if (req.adminSessionTokenHash) {
        db.delete(s.adminSessions)
          .where(
            and(
              eq(s.adminSessions.adminId, admin.id),
              ne(s.adminSessions.tokenHash, req.adminSessionTokenHash),
            ),
          )
          .run();
      }

      logAdminAudit(
        store,
        {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },
        "Changed own administrator password and revoked other sessions",
        "admin_auth",
        admin.id,
        now,
      );
    })();

    if (emailService.configured) {
      enqueueEmail(store, {
        userId: null,
        recipientEmail: row.email,
        recipientName: row.name,
        templateId: "password_changed",
        category: "transactional",
        dedupeKey: `admin_pwd_change_${row.id}_${now}`,
        payload: {
          recipientName: row.name,
          changedAtIso: now,
          audience: "admin",
          appBaseUrl: options.adminOrigin,
        },
      });
      await processEmailQueueBatch(store, emailService, {
        batchSize: 5,
        defaultAppBaseUrl: options.adminOrigin,
      }).catch(() => undefined);
    }

    return { ok: true };
  });
}

