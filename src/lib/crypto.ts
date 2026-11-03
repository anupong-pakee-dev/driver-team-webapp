// §13.3 เข้ารหัสระดับฟิลด์: AES-256-GCM · เก็บ key_version ‖ iv ‖ ciphertext ‖ tag เป็น bytea
// ไฟล์นี้ต้องไม่มี import แบบไม่มีนามสกุล — scripts/seed-dev.ts รันด้วย node ตรงๆ
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const IV_LEN = 12;
const TAG_LEN = 16;

type Keyring = { current: { version: number; key: Buffer }; previous?: { version: number; key: Buffer } };

function decodeKey(name: string, b64: string): Buffer {
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes base64`);
  return key;
}

export function keyringFromEnv(env: Record<string, string | undefined> = process.env): Keyring {
  const cur = env.FIELD_ENCRYPTION_KEY;
  if (!cur) throw new Error("FIELD_ENCRYPTION_KEY is not set");
  const version = Number(env.FIELD_ENCRYPTION_KEY_VERSION ?? "1");
  const ring: Keyring = { current: { version, key: decodeKey("FIELD_ENCRYPTION_KEY", cur) } };
  if (env.FIELD_ENCRYPTION_KEY_PREVIOUS) {
    ring.previous = { version: version - 1, key: decodeKey("FIELD_ENCRYPTION_KEY_PREVIOUS", env.FIELD_ENCRYPTION_KEY_PREVIOUS) };
  }
  return ring;
}

export function encryptField(plain: string, ring: Keyring = keyringFromEnv()): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", ring.current.key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([ring.current.version]), iv, ct, cipher.getAuthTag()]);
}

export function decryptField(blob: Buffer, ring: Keyring = keyringFromEnv()): string {
  const version = blob[0];
  const entry = [ring.current, ring.previous].find((k) => k?.version === version);
  if (!entry) throw new Error(`no key for version ${version}`);
  const iv = blob.subarray(1, 1 + IV_LEN);
  const tag = blob.subarray(blob.length - TAG_LEN);
  const ct = blob.subarray(1 + IV_LEN, blob.length - TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", entry.key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** เบอร์ไทย → E.164 (+66…) · คืน null ถ้ารูปแบบไม่ถูก */
export function normalizeThaiPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let national: string;
  if (digits.startsWith("+66")) national = digits.slice(3);
  else if (digits.startsWith("66") && digits.length === 11) national = digits.slice(2);
  else if (digits.startsWith("0")) national = digits.slice(1);
  else return null;
  if (!/^[689]\d{8}$|^2\d{7}$/.test(national)) return null;
  return `+66${national}`;
}

/** phone_hash = HMAC-SHA256(PHONE_HASH_KEY, E.164) ใช้ค้นหา/กันซ้ำโดยไม่ถอดรหัส */
export function phoneHash(e164: string, key = process.env.PHONE_HASH_KEY): string {
  if (!key) throw new Error("PHONE_HASH_KEY is not set");
  return createHmac("sha256", key).update(e164).digest("hex");
}
