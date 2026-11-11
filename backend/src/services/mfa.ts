import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const ROOT_DIR = fileURLToPath(new URL("../../..", import.meta.url));
const DEV_KEY_PATH = resolve(ROOT_DIR, "backend/data/.dev-mfa.key");

let cachedKey: { source: string; key: Buffer } | null = null;

function resolveEncryptionKey(
  configuredKey: string | undefined,
  isProduction: boolean,
): Buffer {
  const trimmed = configuredKey?.trim() || "";
  if (trimmed) {
    if (trimmed.length < 16) {
      throw new Error(
        "ADMIN_MFA_ENCRYPTION_KEY must be at least 16 characters.",
      );
    }
    if (cachedKey && cachedKey.source === trimmed) return cachedKey.key;
    const key = createHash("sha256").update(trimmed).digest();
    cachedKey = { source: trimmed, key };
    return key;
  }

  if (isProduction) {
    throw new Error(
      "ADMIN_MFA_ENCRYPTION_KEY is required when NODE_ENV=production.",
    );
  }

  if (process.env.NODE_ENV === "test") {
    if (!process.env.__BALANCED_TEST_MFA_KEY) {
      process.env.__BALANCED_TEST_MFA_KEY = randomBytes(32).toString("hex");
    }
    const source = `test:${process.env.__BALANCED_TEST_MFA_KEY}`;
    if (cachedKey && cachedKey.source === source) return cachedKey.key;
    const key = createHash("sha256").update(source).digest();
    cachedKey = { source, key };
    return key;
  }

  if (cachedKey && cachedKey.source === "dev-file") {
    return cachedKey.key;
  }

  mkdirSync(dirname(DEV_KEY_PATH), { recursive: true });
  let hexKey = "";
  if (existsSync(DEV_KEY_PATH)) {
    hexKey = readFileSync(DEV_KEY_PATH, "utf8").trim();
  }
  if (!/^[0-9a-f]{64}$/i.test(hexKey)) {
    hexKey = randomBytes(32).toString("hex");
    writeFileSync(DEV_KEY_PATH, `${hexKey}\n`, { mode: 0o600 });
    try {
      chmodSync(DEV_KEY_PATH, 0o600);
    } catch {
      // Best-effort permission lock on filesystems supporting POSIX modes
    }
  }
  const key = Buffer.from(hexKey, "hex");
  cachedKey = { source: "dev-file", key };
  return key;
}

export function assertMfaConfiguration(
  configuredKey: string | undefined,
  isProduction: boolean,
): void {
  resolveEncryptionKey(configuredKey, isProduction);
}

export function encryptMfaSecret(
  secretBase32: string,
  configuredKey: string | undefined,
  isProduction: boolean,
): string {
  const key = resolveEncryptionKey(configuredKey, isProduction);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(secretBase32, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptMfaSecret(
  payload: string,
  configuredKey: string | undefined,
  isProduction: boolean,
): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Unsupported MFA secret format.");
  }
  const [, ivHex, tagHex, dataHex] = parts;
  const key = resolveEncryptionKey(configuredKey, isProduction);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const normalized = input
    .toUpperCase()
    .replace(/[\s=-]/g, "")
    .trim();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of normalized) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) {
      throw new Error("Invalid Base32 secret.");
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function generateTotpCode(
  secretBase32: string,
  timestampMs = Date.now(),
  stepSeconds = 30,
  digits = 6,
): string {
  const counter = Math.floor(timestampMs / 1000 / stepSeconds);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter), 0);
  const key = base32Decode(secretBase32);
  const hmac = createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binary % 10 ** digits;
  return String(otp).padStart(digits, "0");
}

export function verifyTotpCode(
  secretBase32: string,
  submittedCode: string,
  timestampMs = Date.now(),
  windowSteps = 1,
): boolean {
  const cleaned = submittedCode.replace(/[\s-]/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const actualBuf = Buffer.from(cleaned, "utf8");
  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const expected = generateTotpCode(
      secretBase32,
      timestampMs + offset * 30_000,
    );
    const expectedBuf = Buffer.from(expected, "utf8");
    if (
      actualBuf.length === expectedBuf.length &&
      timingSafeEqual(actualBuf, expectedBuf)
    ) {
      return true;
    }
  }
  return false;
}

export function buildOtpAuthUri({
  secret,
  email,
  issuer = "The Balanced Life Admin",
}: {
  secret: string;
  email: string;
  issuer?: string;
}): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(10);
    let raw = "";
    for (const byte of bytes) {
      raw += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
    }
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 10)}`);
  }
  return codes;
}

export function normalizeRecoveryCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256")
    .update(`mfa-recovery:${normalizeRecoveryCode(code)}`)
    .digest("hex");
}

