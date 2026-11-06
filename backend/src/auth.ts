import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { eq, sql } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Store } from "./db.js";
import * as s from "./schema.js";
import { HttpError } from "./errors.js";

const scrypt = promisify(scryptCallback);

export type PublicUser = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "reader";
  status: "active" | "suspended";
  ageGroup: string;
  guardianConsentConfirmed: boolean;
  createdAt: string;
};

declare module "fastify" {
  interface FastifyRequest {
    user: PublicUser | null;
  }
}

export const publicUser = (user: typeof s.users.$inferSelect): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role === "admin" ? "admin" : "reader",
  status: user.status === "suspended" ? "suspended" : "active",
  ageGroup: user.ageGroup || "18_25",
  guardianConsentConfirmed: Boolean(user.guardianConsentConfirmed),
  createdAt: user.createdAt,
});

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

export const requireAdmin = (req: FastifyRequest): PublicUser => {
  const user = requireUser(req);
  if (user.role !== "admin") {
    throw new HttpError(403, "Administrator access required.");
  }
  return user;
};

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
  const { db } = store;
  if (req.cookies.balanced_session) {
    db.delete(s.sessions)
      .where(
        eq(s.sessions.tokenHash, tokenHash(req.cookies.balanced_session)),
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

  reply.setCookie("balanced_session", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 86400,
  });

  return { user: publicUser(user) };
}
