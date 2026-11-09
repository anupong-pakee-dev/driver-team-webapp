import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptField, encryptField, keyringFromEnv, normalizeThaiPhone, phoneHash } from "@/lib/crypto";
import { redact, redactString } from "@/lib/redact";
import { formatBaht, pct } from "@/lib/money";

const k1 = randomBytes(32).toString("base64");
const k2 = randomBytes(32).toString("base64");

describe("field encryption", () => {
  it("round-trips Thai text", () => {
    const ring = keyringFromEnv({ FIELD_ENCRYPTION_KEY: k1 });
    const blob = encryptField("สมชาย ใจดี", ring);
    expect(blob[0]).toBe(1);
    expect(decryptField(blob, ring)).toBe("สมชาย ใจดี");
  });

  it("reads values written with the previous key after rotation", () => {
    const old = keyringFromEnv({ FIELD_ENCRYPTION_KEY: k1 });
    const blob = encryptField("0812345678", old);
    const rotated = keyringFromEnv({
      FIELD_ENCRYPTION_KEY: k2, FIELD_ENCRYPTION_KEY_VERSION: "2", FIELD_ENCRYPTION_KEY_PREVIOUS: k1,
    });
    expect(decryptField(blob, rotated)).toBe("0812345678");
    expect(encryptField("x", rotated)[0]).toBe(2);
  });

  it("rejects tampered ciphertext", () => {
    const ring = keyringFromEnv({ FIELD_ENCRYPTION_KEY: k1 });
    const blob = encryptField("secret", ring);
    blob[15] ^= 1;
    expect(() => decryptField(blob, ring)).toThrow();
  });
});

describe("phone", () => {
  it.each([
    ["081-234-5678", "+66812345678"],
    ["+66 81 234 5678", "+66812345678"],
    ["66812345678", "+66812345678"],
    ["02-123-4567", "+6621234567"],
    ["12345", null],
  ])("normalizes %s", (input, out) => expect(normalizeThaiPhone(input)).toBe(out));

  it("hashes deterministically with a key", () => {
    expect(phoneHash("+66812345678", "k")).toBe(phoneHash("+66812345678", "k"));
    expect(phoneHash("+66812345678", "k")).not.toBe(phoneHash("+66812345678", "other"));
  });
});

describe("redact", () => {
  it("removes phones, names, coordinates and encrypted fields", () => {
    const out = redact({ phone: "0812345678", full_name: "สมชาย", lat: 13.7, note: "โทร 081-234-5678", nested: { phone_enc: "x" } });
    expect(out).toEqual({ phone: "[redacted]", full_name: "[redacted]", lat: "[redacted]", note: "โทร [phone]", nested: { phone_enc: "[redacted]" } });
    expect(redactString("Bearer abc.def")).toBe("Bearer [redacted]");
  });
});

describe("money", () => {
  it("formats satang as baht", () => {
    expect(formatBaht(95000)).toBe("950฿");
    expect(formatBaht(120000)).toBe("1,200฿");
    expect(formatBaht(14250)).toBe("142.50฿");
  });
  it("rounds percentages to whole satang", () => {
    expect(pct(28500, 50)).toBe(14250);
    expect(pct(14250, 50)).toBe(7125);
  });
});
