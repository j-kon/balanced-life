import type { FastifyInstance } from "fastify";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Store } from "../db.js";
import * as s from "../schema.js";
import {
  READER_SESSION_COOKIE,
  clearReaderCookie,
  establishSession,
  hashPassword,
  newToken,
  publicUser,
  requireUser,
  tokenHash,
  verifyPassword,
} from "../auth.js";
import { HttpError } from "../errors.js";
import {
  forgotPasswordSchema,
  loginSchema,
  passwordChangeSchema,
  profileUpdateSchema,
  registerSchema,
  resetPasswordSchema,
} from "../validation.js";
import { getAppSettings } from "../services/settings.js";
import {
  createNotificationEvent,
  getUnreadNotificationCount,
} from "../services/notifications.js";
import { getReaderAccessSummary } from "../services/access.js";
import type { EmailService } from "../services/email.js";
import { onboardingUpdateSchema } from "../validation.js";

export function registerAuthRoutes(
  app: FastifyInstance,
  prefix: string,
  store: Store,
  emailService: EmailService,
  options: { isProduction: boolean; appOrigin: string },
) {
  const { db } = store;

  app.get(prefix + "/auth/me", async (req) => ({
    user: req.user,
    access: getReaderAccessSummary(store, req.user),
    unreadNotificationsCount: req.user
      ? getUnreadNotificationCount(store, req.user.id)
      : 0,
  }));

  app.post(prefix + "/me/onboarding", async (req) => {
    const currentUser = requireUser(req);
    const { completed } = onboardingUpdateSchema.parse(req.body || {});
    const now = new Date().toISOString();
    const updated = db
      .update(s.users)
      .set({
        onboardingCompletedAt: completed ? now : null,
        updatedAt: now,
      })
      .where(eq(s.users.id, currentUser.id))
      .returning()
      .get();
    if (!updated) throw new HttpError(404, "Account not found.");
    const pub = publicUser(updated);
    return {
      ok: true,
      user: pub,
      access: getReaderAccessSummary(store, pub),
    };
  });

  app.post(
    prefix + "/auth/register",
    { config: { rateLimit: { max: 15, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const settings = getAppSettings(store);
      if (!settings.allowRegistration) {
        throw new HttpError(
          403,
          "New reader registration is currently closed.",
        );
      }
      const input = registerSchema.parse(req.body);
      const existingAdmin = db
        .select({ id: s.adminUsers.id })
        .from(s.adminUsers)
        .where(eq(s.adminUsers.email, input.email))
        .get();
      if (existingAdmin) {
        throw new HttpError(
          409,
          "This email address is reserved for staff administration. Please use a separate personal email for your reader account.",
        );
      }
      const now = new Date().toISOString();
      const user = db
        .insert(s.users)
        .values({
          name: input.name,
          email: input.email,
          passwordHash: await hashPassword(input.password),
          role: "reader",
          status: "active",
          suspendedReason: "",
          ageGroup: input.ageGroup || "18_25",
          guardianConsentConfirmed: Boolean(input.guardianConsentConfirmed),
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      return establishSession(store, user, req, reply, options.isProduction);
    },
  );

  app.post(
    prefix + "/auth/login",
    { config: { rateLimit: { max: 25, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const input = loginSchema.parse(req.body);
      const user = db
        .select()
        .from(s.users)
        .where(eq(s.users.email, input.email))
        .get();

      // Always perform password derivation, including for unknown accounts
      const valid = await verifyPassword(
        input.password,
        user?.passwordHash ||
          "00000000000000000000000000000000:" + "00".repeat(64),
      );
      if (!user || !valid || user.role !== "reader") {
        throw new HttpError(401, "Email or password is incorrect.");
      }
      if (user.status === "suspended") {
        throw new HttpError(
          403,
          "This account has been suspended. Please contact support.",
        );
      }
      return establishSession(store, user, req, reply, options.isProduction);
    },
  );

  app.post(prefix + "/auth/logout", async (req, reply) => {
    const cookieToken = req.cookies[READER_SESSION_COOKIE];
    if (cookieToken) {
      db.delete(s.sessions)
        .where(eq(s.sessions.tokenHash, tokenHash(cookieToken)))
        .run();
    }
    clearReaderCookie(reply, options.isProduction);
    return { ok: true };
  });

  app.post(
    prefix + "/auth/forgot-password",
    { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } },
    async (req) => {
      const input = forgotPasswordSchema.parse(req.body);
      if (!emailService.configured) {
        throw new HttpError(
          503,
          "Automated password recovery emails are not configured in this environment. Set EMAIL_WEBHOOK_URL to enable email delivery, or contact the administrator.",
        );
      }

      const user = db
        .select()
        .from(s.users)
        .where(eq(s.users.email, input.email))
        .get();

      if (user && user.status === "active") {
        const rawToken = newToken();
        const now = Date.now();
        const expiresInMinutes = 60;
        db.insert(s.passwordResetTokens)
          .values({
            tokenHash: tokenHash(rawToken),
            userId: user.id,
            expiresAt: new Date(now + expiresInMinutes * 60000).toISOString(),
            usedAt: null,
            createdAt: new Date(now).toISOString(),
          })
          .run();

        const resetUrl = `${options.appOrigin}/reset-password?token=${encodeURIComponent(rawToken)}`;
        await emailService.sendPasswordReset({
          to: user.email,
          name: user.name,
          resetUrl,
          expiresInMinutes,
        });
      }

      return {
        ok: true,
        message:
          "If an active account matches that email address, a password reset link has been sent.",
      };
    },
  );

  app.post(
    prefix + "/auth/reset-password",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req) => {
      const input = resetPasswordSchema.parse(req.body);
      const now = new Date().toISOString();
      const hashed = tokenHash(input.token);

      const tokenRow = db
        .select()
        .from(s.passwordResetTokens)
        .where(
          and(
            eq(s.passwordResetTokens.tokenHash, hashed),
            isNull(s.passwordResetTokens.usedAt),
            gt(s.passwordResetTokens.expiresAt, now),
          ),
        )
        .get();

      if (!tokenRow) {
        throw new HttpError(
          400,
          "This password reset link is invalid or has expired.",
        );
      }

      const passwordHash = await hashPassword(input.password);

      store.sqlite.transaction(() => {
        db.update(s.users)
          .set({ passwordHash, updatedAt: now })
          .where(eq(s.users.id, tokenRow.userId))
          .run();
        db.update(s.passwordResetTokens)
          .set({ usedAt: now })
          .where(eq(s.passwordResetTokens.tokenHash, hashed))
          .run();
        // Revoke all existing sessions for security
        db.delete(s.sessions)
          .where(eq(s.sessions.userId, tokenRow.userId))
          .run();
      })();

      return {
        ok: true,
        message:
          "Your password has been updated. Please sign in with your new password.",
      };
    },
  );

  app.patch(prefix + "/me/profile", async (req) => {
    const currentUser = requireUser(req);
    const input = profileUpdateSchema.parse(req.body);
    if (input.email !== currentUser.email) {
      const adminConflict = db
        .select({ id: s.adminUsers.id })
        .from(s.adminUsers)
        .where(eq(s.adminUsers.email, input.email))
        .get();
      if (adminConflict) {
        throw new HttpError(
          409,
          "That email address is reserved for staff administration and cannot be used for a reader profile.",
        );
      }
    }
    const now = new Date().toISOString();

    const updated = db
      .update(s.users)
      .set({
        name: input.name,
        email: input.email,
        updatedAt: now,
      })
      .where(eq(s.users.id, currentUser.id))
      .returning()
      .get();

    if (!updated) throw new HttpError(404, "Account not found.");
    return { user: publicUser(updated) };
  });

  app.post(prefix + "/me/password", async (req) => {
    const currentUser = requireUser(req);
    const input = passwordChangeSchema.parse(req.body);

    const row = db
      .select()
      .from(s.users)
      .where(eq(s.users.id, currentUser.id))
      .get();
    if (!row) throw new HttpError(404, "Account not found.");

    const valid = await verifyPassword(input.currentPassword, row.passwordHash);
    if (!valid) {
      throw new HttpError(401, "Your current password is incorrect.");
    }

    const now = new Date().toISOString();
    const newHash = await hashPassword(input.newPassword);
    db.update(s.users)
      .set({
        passwordHash: newHash,
        updatedAt: now,
      })
      .where(eq(s.users.id, currentUser.id))
      .run();

    createNotificationEvent(store, {
      userId: currentUser.id,
      category: "account",
      title: "Account Password Updated",
      body: "Your Balanced Life Devotional account password was changed.",
      actionUrl: "/account",
      dedupeKey: `pwd_change_${currentUser.id}_${now.slice(0, 16)}`,
    });

    return { ok: true };
  });
}

