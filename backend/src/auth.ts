import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, sql } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Store } from "./db.js";
import * as s from "./schema.js";
import { HttpError } from "./errors.js";

const scrypt = promisify(scryptCallback);

export const READER_SESSION_COOKIE = "balanced_session";
export const ADMIN_SESSION_COOKIE = "balanced_admin_session";

export const ADMIN_ROLES = [
  "owner",
  "content_editor",
  "orders_manager",
  "finance_manager",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminPermission =
  | "overview.read"
  | "devotionals.read"
  | "devotionals.write"
  | "digital_orders.read"
  | "digital_orders.write"
  | "printed_orders.read"
  | "printed_orders.write"
  | "bulk_orders.read"
  | "bulk_orders.write"
  | "readers.read"
  | "readers.write"
  | "payments.read"
  | "payments.write"
  | "notifications.read"
  | "notifications.write"
  | "notifications.broadcast"
  | "settings.read"
  | "settings.write"
  | "audit.read"
  | "staff.read"
  | "staff.write";

export const GRANTABLE_CUSTOM_PERMISSIONS = [
  "notifications.write",
  "notifications.broadcast",
] as const;

export const ALL_ADMIN_PERMISSIONS: readonly AdminPermission[] = [
  "overview.read",
  "devotionals.read",
  "devotionals.write",
  "digital_orders.read",
  "digital_orders.write",
  "printed_orders.read",
  "printed_orders.write",
  "bulk_orders.read",
  "bulk_orders.write",
  "readers.read",
  "readers.write",
  "payments.read",
  "payments.write",
  "notifications.read",
  "notifications.write",
  "notifications.broadcast",
  "settings.read",
  "settings.write",
  "audit.read",
  "staff.read",
  "staff.write",
];

const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  owner: ALL_ADMIN_PERMISSIONS,
  content_editor: [
    "overview.read",
    "devotionals.read",
    "devotionals.write",
    "notifications.read",
  ],
  orders_manager: [
    "overview.read",
    "printed_orders.read",
    "printed_orders.write",
    "bulk_orders.read",
    "bulk_orders.write",
    "digital_orders.read",
    "readers.read",
    "notifications.read",
    "notifications.write",
  ],
  finance_manager: [
    "overview.read",
    "payments.read",
    "payments.write",
    "digital_orders.read",
    "digital_orders.write",
    "printed_orders.read",
    "printed_orders.write",
    "bulk_orders.read",
    "readers.read",
    "audit.read",
  ],
};

export const normalizeAdminRole = (role: string): AdminRole =>
  ADMIN_ROLES.includes(role as AdminRole)
    ? (role as AdminRole)
    : "content_editor";

export const getPermissionsForRole = (role: AdminRole): AdminPermission[] => [
  ...ROLE_PERMISSIONS[role],
];

export function parseCustomAdminPermissions(raw?: string | null): AdminPermission[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is AdminPermission =>
        typeof p === "string" &&
        (GRANTABLE_CUSTOM_PERMISSIONS as readonly string[]).includes(p),
    );
  } catch {
    return [];
  }
}

export const hasAdminPermission = (
  role: AdminRole,
  permission: AdminPermission,
  customPermissions: AdminPermission[] = [],
): boolean =>
  ROLE_PERMISSIONS[role].includes(permission) ||
  customPermissions.includes(permission);

export type PublicUser = {
  id: number;
  name: string;
  email: string;
  role: "reader";
  status: "active" | "suspended";
  ageGroup: string;
  guardianConsentConfirmed: boolean;
  onboardingCompletedAt: string | null;
  createdAt: string;
};

export type PublicAdmin = {
  id: number;
  name: string;
  email: string;
  role: AdminRole;
  status: "active" | "suspended";
  mfaEnabled: boolean;
  mfaVerified: boolean;
  permissions: AdminPermission[];
  customPermissions: AdminPermission[];
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
};

export type AdminActor = {
  id: number | null;
  name: string;
  email: string;
  role: string;
};

declare module "fastify" {
  interface FastifyRequest {
    user: PublicUser | null;
    admin: PublicAdmin | null;
    adminSessionTokenHash: string | null;
  }
}

export const publicUser = (user: typeof s.users.$inferSelect): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: "reader",
  status: user.status === "suspended" ? "suspended" : "active",
  ageGroup: user.ageGroup || "18_25",
  guardianConsentConfirmed: Boolean(user.guardianConsentConfirmed),
  onboardingCompletedAt: user.onboardingCompletedAt || null,
  createdAt: user.createdAt,
});

export const publicAdmin = (
  admin: typeof s.adminUsers.$inferSelect,
  mfaVerified: boolean,
): PublicAdmin => {
  const role = normalizeAdminRole(admin.role);
  const customPermissions = parseCustomAdminPermissions(
    admin.customPermissionsJson,
  );
  const merged = Array.from(
    new Set([...getPermissionsForRole(role), ...customPermissions]),
  );
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role,
    status: admin.status === "suspended" ? "suspended" : "active",
    mfaEnabled: Boolean(admin.mfaEnabled),
    mfaVerified: Boolean(mfaVerified),
    permissions: merged,
    customPermissions,
    lastLoginAt: admin.lastLoginAt || null,
    lastActiveAt: admin.lastActiveAt || null,
    createdAt: admin.createdAt,
  };
};

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return salt + ":" + hash.toString("hex");
}

export async function verifyPassword(password: string, encoded: string) {
  const [salt, stored] = encoded.split(":");
  if (!salt || !stored) return false;
  const expected = Buffer.from(stored, "hex");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function assertStrongAdminPassword(password: string) {
  if (password.length < 12) {
    throw new HttpError(
      400,
      "Administrator passwords must be at least 12 characters.",
    );
  }
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigitOrSymbol = /[\d\W_]/.test(password);
  if (!hasLower || !hasUpper || !hasDigitOrSymbol) {
    throw new HttpError(
      400,
      "Administrator passwords must include uppercase letters, lowercase letters, and at least one number or symbol.",
    );
  }
}

export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const newToken = () => randomBytes(32).toString("hex");

export const requireUser = (req: FastifyRequest): PublicUser => {
  if (!req.user) throw new HttpError(401, "Sign in to continue.");
  if (req.user.status === "suspended") {
    throw new HttpError(403, "This account has been suspended.");
  }
  return req.user;
};

export const requireAdminSessionPendingOk = (
  req: FastifyRequest,
): PublicAdmin => {
  if (!req.admin) {
    throw new HttpError(401, "Administrator sign-in is required.");
  }
  if (req.admin.status === "suspended") {
    throw new HttpError(
      403,
      "This administrator account has been suspended.",
    );
  }
  return req.admin;
};

export const requireAdmin = (req: FastifyRequest): PublicAdmin => {
  const admin = requireAdminSessionPendingOk(req);
  if (!admin.mfaEnabled || !admin.mfaVerified) {
    throw new HttpError(
      403,
      "Multi-factor authentication verification is required.",
    );
  }
  return admin;
};

export const adminHasPermission = (
  admin: PublicAdmin,
  permission: AdminPermission,
): boolean => admin.permissions.includes(permission);

export const requireAdminPermission = (
  req: FastifyRequest,
  permission: AdminPermission,
): PublicAdmin => {
  const admin = requireAdmin(req);
  if (!adminHasPermission(admin, permission)) {
    throw new HttpError(
      403,
      "Your administrator role does not have permission for this action.",
    );
  }
  return admin;
};

export const requireOwner = (req: FastifyRequest): PublicAdmin => {
  const admin = requireAdmin(req);
  if (admin.role !== "owner") {
    throw new HttpError(403, "Owner administrator access is required.");
  }
  return admin;
};

export function logAdminAudit(
  store: Store,
  actor: AdminActor,
  action: string,
  entityType = "system",
  entityId: string | number = "",
  createdAt = new Date().toISOString(),
) {
  store.db
    .insert(s.auditLogs)
    .values({
      adminId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      actorRole: actor.role,
      entityType,
      entityId: String(entityId ?? ""),
      action,
      createdAt,
    })
    .run();
}

export function clearReaderCookie(reply: FastifyReply, isProduction: boolean) {
  reply.clearCookie(READER_SESSION_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
  });
}

export function clearAdminCookie(reply: FastifyReply, isProduction: boolean) {
  reply.clearCookie(ADMIN_SESSION_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
  });
}

export async function establishSession(
  store: Store,
  user: typeof s.users.$inferSelect,
  req: FastifyRequest,
  reply: FastifyReply,
  isProduction: boolean,
) {
  if (user.status === "suspended") {
    throw new HttpError(
      403,
      "This account has been suspended. Please contact support.",
    );
  }
  if (user.role !== "reader") {
    throw new HttpError(403, "Invalid account type for reader sign-in.");
  }
  const { db } = store;
  if (req.cookies[READER_SESSION_COOKIE]) {
    db.delete(s.sessions)
      .where(
        eq(s.sessions.tokenHash, tokenHash(req.cookies[READER_SESSION_COOKIE])),
      )
      .run();
  }
  db.delete(s.sessions)
    .where(sql`${s.sessions.expiresAt} <= ${new Date().toISOString()}`)
    .run();

  const token = newToken();
  db.insert(s.sessions)
    .values({
      tokenHash: tokenHash(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    })
    .run();

  reply.setCookie(READER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 86400,
  });

  return { user: publicUser(user) };
}

export async function establishAdminSession(
  store: Store,
  admin: typeof s.adminUsers.$inferSelect,
  req: FastifyRequest,
  reply: FastifyReply,
  options: {
    isProduction: boolean;
    maxHours: number;
    mfaVerified: boolean;
  },
) {
  if (admin.status === "suspended") {
    throw new HttpError(
      403,
      "This administrator account has been suspended.",
    );
  }
  const { db } = store;
  const now = new Date().toISOString();
  const existingCookie = req.cookies[ADMIN_SESSION_COOKIE];
  if (existingCookie) {
    db.delete(s.adminSessions)
      .where(eq(s.adminSessions.tokenHash, tokenHash(existingCookie)))
      .run();
  }
  db.delete(s.adminSessions)
    .where(sql`${s.adminSessions.expiresAt} <= ${now}`)
    .run();

  const maxSeconds = Math.max(3600, options.maxHours * 3600);
  const token = newToken();
  const hash = tokenHash(token);
  const userAgent =
    typeof req.headers["user-agent"] === "string"
      ? req.headers["user-agent"].slice(0, 240)
      : "";

  db.insert(s.adminSessions)
    .values({
      tokenHash: hash,
      adminId: admin.id,
      mfaVerified: options.mfaVerified,
      ipAddress: req.ip || "",
      userAgent,
      lastActivityAt: now,
      expiresAt: new Date(Date.now() + maxSeconds * 1000).toISOString(),
      createdAt: now,
    })
    .run();

  db.update(s.adminUsers)
    .set({
      lastLoginAt: now,
      lastActiveAt: now,
      updatedAt: now,
    })
    .where(eq(s.adminUsers.id, admin.id))
    .run();

  req.adminSessionTokenHash = hash;

  reply.setCookie(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: options.isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: maxSeconds,
  });

  return publicAdmin(admin, options.mfaVerified);
}

export function resolveAdminSession(
  store: Store,
  token: string,
  idleMinutes: number,
): { admin: PublicAdmin; tokenHash: string } | null {
  const hash = tokenHash(token);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const row = store.db
    .select({
      session: s.adminSessions,
      admin: s.adminUsers,
    })
    .from(s.adminSessions)
    .innerJoin(s.adminUsers, eq(s.adminUsers.id, s.adminSessions.adminId))
    .where(
      and(
        eq(s.adminSessions.tokenHash, hash),
        gt(s.adminSessions.expiresAt, nowIso),
      ),
    )
    .get();

  if (!row) return null;

  const lastActivityMs = Date.parse(row.session.lastActivityAt);
  if (
    !Number.isFinite(lastActivityMs) ||
    nowMs - lastActivityMs > idleMinutes * 60_000
  ) {
    store.db
      .delete(s.adminSessions)
      .where(eq(s.adminSessions.tokenHash, hash))
      .run();
    return null;
  }

  if (row.admin.status !== "active") {
    store.db
      .delete(s.adminSessions)
      .where(eq(s.adminSessions.tokenHash, hash))
      .run();
    return null;
  }

  // Throttle session touch updates to at most once every 30s to avoid unnecessary writes
  if (nowMs - lastActivityMs >= 30_000) {
    store.db
      .update(s.adminSessions)
      .set({ lastActivityAt: nowIso })
      .where(eq(s.adminSessions.tokenHash, hash))
      .run();
    store.db
      .update(s.adminUsers)
      .set({ lastActiveAt: nowIso })
      .where(eq(s.adminUsers.id, row.admin.id))
      .run();
  }

  return {
    admin: publicAdmin(row.admin, Boolean(row.session.mfaVerified)),
    tokenHash: hash,
  };
}
