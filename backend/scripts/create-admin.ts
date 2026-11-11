import { eq } from "drizzle-orm";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { openDatabase } from "../src/db.js";
import * as s from "../src/schema.js";
import {
  ADMIN_ROLES,
  assertStrongAdminPassword,
  hashPassword,
  logAdminAudit,
  type AdminRole,
} from "../src/auth.js";
import {
  buildOtpAuthUri,
  encryptMfaSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotpCode,
} from "../src/services/mfa.js";
import { getEnvConfig } from "../src/config.js";
import { z } from "zod";

if (
  process.argv.some(
    (arg) => arg === "--password" || arg.startsWith("--password="),
  )
) {
  console.error(
    "Security policy: passing --password on the command line is disallowed because it exposes credentials in shell history and process listings.\nRun `npm run admin:create` interactively to enter a masked password, or pipe via --password-stdin.",
  );
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string" },
    "password-stdin": { type: "boolean", default: false },
    "enroll-mfa": { type: "boolean", default: false },
  },
  strict: true,
});

async function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error("Interactive password prompt requires a TTY terminal.");
  }
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write(question);
    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let value = "";
    const cleanup = () => {
      stdin.setRawMode?.(Boolean(wasRaw));
      stdin.pause();
      stdin.removeListener("data", onData);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\n" || ch === "\r" || ch === "\u0004") {
          cleanup();
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          cleanup();
          stdout.write("\n");
          reject(new Error("Cancelled."));
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        if (ch >= " ") {
          value += ch;
          stdout.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function readStdinLine(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/)[0] || "";
}

const emailSchema = z
  .email("Enter a valid dedicated administrator email address.")
  .max(254)
  .transform((v) => v.toLowerCase());
const nameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters.")
  .max(100);
const roleSchema = z.enum(ADMIN_ROLES);

const store = openDatabase();
const env = getEnvConfig();
const now = new Date().toISOString();

try {
  const legacyPending = store.db
    .select({
      id: s.users.id,
      name: s.users.name,
      email: s.users.email,
    })
    .from(s.users)
    .where(eq(s.users.legacyAdminStatus, "pending_decision"))
    .all();

  let email = (values.email || "").trim();
  let name = (values.name || "").trim();
  let roleInput = (values.role || "").trim();
  let retireLegacy = false;
  let migrateLegacy = false;

  const rl = process.stdin.isTTY
    ? createInterface({ input: process.stdin, output: process.stdout })
    : null;

  try {
    if (legacyPending.length > 0) {
      console.log(
        "\nPre-separation administrator account(s) detected in the reader table (sessions already revoked & demoted to reader):",
      );
      for (const leg of legacyPending) {
        console.log(`  - ${leg.name} <${leg.email}> (reader id=${leg.id})`);
      }
      if (rl) {
        const decision = (
          await rl.question(
            "Choose action: [m] create dedicated separate admin account and mark legacy status migrated, or [r] retire legacy admin status now (m/r, default m): ",
          )
        )
          .trim()
          .toLowerCase();
        retireLegacy = decision === "r";
        migrateLegacy = !retireLegacy;
      } else {
        migrateLegacy = true;
      }
    }

    if (retireLegacy && rl && !email) {
      for (const leg of legacyPending) {
        store.db
          .update(s.users)
          .set({ legacyAdminStatus: "retired", updatedAt: now })
          .where(eq(s.users.id, leg.id))
          .run();
      }
      logAdminAudit(
        store,
        {
          id: null,
          name: "CLI Bootstrap",
          email: "cli@localhost",
          role: "system",
        },
        `Retired ${legacyPending.length} legacy reader-table admin status record(s)`,
        "legacy_admin",
        legacyPending.map((l) => l.id).join(","),
        now,
      );
      console.log("Marked legacy administrator status as retired.");
      process.exit(0);
    }

    if (!name && rl) {
      name = (await rl.question("Administrator full name: ")).trim();
    }
    if (!email && rl) {
      email = (
        await rl.question(
          "Dedicated administrator email (must be separate from any reader account): ",
        )
      ).trim();
    }
    if (!roleInput) {
      if (rl) {
        const answer = (
          await rl.question(
            `Administrator role (${ADMIN_ROLES.join(" / ")}) [owner]: `,
          )
        ).trim();
        roleInput = answer || "owner";
      } else {
        roleInput = "owner";
      }
    }
  } finally {
    rl?.close();
  }

  const nameCheck = nameSchema.safeParse(name);
  const emailCheck = emailSchema.safeParse(email);
  const roleCheck = roleSchema.safeParse(roleInput);
  if (!nameCheck.success || !emailCheck.success || !roleCheck.success) {
    const msgs = [
      ...(nameCheck.success ? [] : nameCheck.error.issues.map((i) => i.message)),
      ...(emailCheck.success ? [] : emailCheck.error.issues.map((i) => i.message)),
      ...(roleCheck.success ? [] : roleCheck.error.issues.map((i) => i.message)),
    ];
    console.error("Invalid administrator details:", msgs.join(" "));
    process.exit(1);
  }
  const parsedName = nameCheck.data;
  const parsedEmail = emailCheck.data;
  const parsedRole: AdminRole = roleCheck.data;

  const readerCollision = store.db
    .select({ id: s.users.id })
    .from(s.users)
    .where(eq(s.users.email, parsedEmail))
    .get();
  if (readerCollision) {
    console.error(
      `Rejected: "${parsedEmail}" belongs to an ordinary reader account (users.id=${readerCollision.id}).\nAdministrators MUST use a separate dedicated email address.`,
    );
    process.exit(1);
  }

  let password = "";
  if (values["password-stdin"]) {
    password = (await readStdinLine()).trim();
  } else if (process.stdin.isTTY) {
    password = (
      await promptHidden(
        "Administrator password (min 12 chars, upper + lower + number/symbol): ",
      )
    ).trim();
    const confirm = (await promptHidden("Confirm password: ")).trim();
    if (password !== confirm) {
      console.error("Passwords do not match.");
      process.exit(1);
    }
  }

  if (!password) {
    console.error(
      'Usage: npm run admin:create -- --name "Full Name" --email staff-admin@cossyteens.com --role owner',
    );
    process.exit(1);
  }

  assertStrongAdminPassword(password);
  const passwordHash = await hashPassword(password);

  const existingAdmin = store.db
    .select()
    .from(s.adminUsers)
    .where(eq(s.adminUsers.email, parsedEmail))
    .get();

  let adminRecord: typeof s.adminUsers.$inferSelect;
  if (existingAdmin) {
    adminRecord = store.db
      .update(s.adminUsers)
      .set({
        name: parsedName,
        role: parsedRole,
        passwordHash,
        status: "active",
        suspendedReason: "",
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: now,
      })
      .where(eq(s.adminUsers.id, existingAdmin.id))
      .returning()
      .get();
  } else {
    adminRecord = store.db
      .insert(s.adminUsers)
      .values({
        name: parsedName,
        email: parsedEmail,
        passwordHash,
        role: parsedRole,
        status: "active",
        suspendedReason: "",
        mfaEnabled: false,
        mfaSecretEnc: null,
        mfaPendingSecretEnc: null,
        mfaVerifiedAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        lastActiveAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  }

  let recoveryCodes: string[] | null = null;
  if (values["enroll-mfa"]) {
    const secret = generateTotpSecret();
    const uri = buildOtpAuthUri({ secret, email: adminRecord.email });
    console.log("\nAuthenticator setup:");
    console.log(`  Manual key: ${secret}`);
    console.log(`  otpauth URI: ${uri}`);
    if (process.stdin.isTTY) {
      const mfaRl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      try {
        const otp = (
          await mfaRl.question("Enter 6-digit code from your authenticator app: ")
        ).trim();
        if (!verifyTotpCode(secret, otp)) {
          throw new Error("Invalid 6-digit TOTP code.");
        }
      } finally {
        mfaRl.close();
      }
      recoveryCodes = generateRecoveryCodes(8);
      const enc = encryptMfaSecret(
        secret,
        env.adminMfaEncryptionKey,
        env.isProduction,
      );
      store.sqlite.transaction(() => {
        store.db
          .update(s.adminUsers)
          .set({
            mfaEnabled: true,
            mfaSecretEnc: enc,
            mfaPendingSecretEnc: null,
            mfaVerifiedAt: now,
            updatedAt: now,
          })
          .where(eq(s.adminUsers.id, adminRecord.id))
          .run();
        store.db
          .delete(s.adminMfaRecoveryCodes)
          .where(eq(s.adminMfaRecoveryCodes.adminId, adminRecord.id))
          .run();
        for (const code of recoveryCodes!) {
          store.db
            .insert(s.adminMfaRecoveryCodes)
            .values({
              adminId: adminRecord.id,
              codeHash: hashRecoveryCode(code),
              usedAt: null,
              createdAt: now,
            })
            .run();
        }
      })();
    }
  }

  if (migrateLegacy && legacyPending.length > 0) {
    for (const leg of legacyPending) {
      store.db
        .update(s.users)
        .set({ legacyAdminStatus: "migrated", updatedAt: now })
        .where(eq(s.users.id, leg.id))
        .run();
    }
  }

  logAdminAudit(
    store,
    {
      id: adminRecord.id,
      name: adminRecord.name,
      email: adminRecord.email,
      role: adminRecord.role,
    },
    `${existingAdmin ? "Updated" : "Bootstrapped"} dedicated administrator account (${adminRecord.email}, role=${adminRecord.role}) via CLI`,
    "admin_staff",
    adminRecord.id,
    now,
  );

  console.log(
    `\nAdministrator ready: ${adminRecord.name} <${adminRecord.email}> (id=${adminRecord.id}, role=${adminRecord.role})`,
  );
  if (!adminRecord.mfaEnabled && !recoveryCodes) {
    console.log(
      "MFA enrollment is required on first sign-in at http://localhost:5174 (or production https://admin.cossyteens.com).",
    );
  }
  if (recoveryCodes) {
    console.log(
      "\nSave these single-use backup recovery codes in a secure password manager (shown once):",
    );
    for (const c of recoveryCodes) {
      console.log(`  ${c}`);
    }
  }
} finally {
  store.sqlite.close();
}
