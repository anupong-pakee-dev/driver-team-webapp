import { describe, expect, it } from "vitest";
import { cancellation, type CancelPolicy } from "@/domain/cancellation";
import { crc16, promptPayPayload, promptPayTarget } from "@/domain/promptpay";
import { accountMatches, checkSlip } from "@/domain/slip";

const policy: CancelPolicy = { full_refund_hours: 48, mid: { refundPct: 50, driverPct: 25 }, late: { driverPct: 50 }, noShowDriverPct: 50 };
const pickupAt = new Date("2026-11-10T10:00:00Z");
const at = (hoursBefore: number) => new Date(pickupAt.getTime() - hoursBefore * 3_600_000);
const money = { depositPaid: 28500, balancePaid: 0, pickupAt };

describe("cancellation (BR-CANCEL-01, every row)", () => {
  it("> 48h: full refund", () => expect(cancellation(money, "customer", at(49), policy)).toEqual({ refund: 28500, driver: 0, company: 0, rule: ">48h" }));
  it("exactly 48h → 24–48 row", () => expect(cancellation(money, "customer", at(48), policy).rule).toBe("24-48h"));
  it("24–48h: matches the design doc example (30h: 142.50 / 71.25 / 71.25)", () =>
    expect(cancellation(money, "customer", at(30), policy)).toEqual({ refund: 14250, driver: 7125, company: 7125, rule: "24-48h" }));
  it("exactly 24h → 24–48 row", () => expect(cancellation(money, "customer", at(24), policy).rule).toBe("24-48h"));
  it("< 24h: no deposit refund, driver 50%", () =>
    expect(cancellation(money, "customer", at(23.99), policy)).toEqual({ refund: 0, driver: 14250, company: 14250, rule: "<24h" }));
  it("no-show: driver 50% + wait fee", () =>
    expect(cancellation({ ...money, waitFee: 10000 }, "no_show", at(-1), policy)).toEqual({ refund: 0, driver: 24250, company: 4250, rule: "no_show" }));
  it("company cancels: everything back", () =>
    expect(cancellation({ ...money, balancePaid: 66500 }, "company", at(1), policy)).toEqual({ refund: 95000, driver: 0, company: 0, rule: "company" }));
  it("flight cancelled: everything back", () => expect(cancellation(money, "flight_cancelled", at(1), policy).refund).toBe(28500));
  it("balance already paid is always refunded in full", () =>
    expect(cancellation({ ...money, balancePaid: 66500 }, "customer", at(2), policy)).toMatchObject({ refund: 66500, driver: 14250 }));
  it("parts always add up to what was paid", () => {
    for (const h of [100, 48, 47, 30, 24, 23, 1, -5]) {
      const r = cancellation({ depositPaid: 28501, balancePaid: 333, pickupAt }, "customer", at(h), policy);
      expect(r.refund + r.driver + r.company).toBe(28501 + 333);
    }
  });
});

describe("PromptPay QR", () => {
  it("crc16 CCITT-FALSE check value", () => expect(crc16("123456789")).toBe("29B1"));
  it("maps mobile and tax id targets", () => {
    expect(promptPayTarget("081-234-5678")).toEqual({ tag: "01", value: "0066812345678" });
    expect(promptPayTarget("0105561234567")).toEqual({ tag: "02", value: "0105561234567" });
    expect(() => promptPayTarget("12345")).toThrow();
  });
  it("builds a dynamic payload with amount and a valid checksum", () => {
    const p = promptPayPayload("0812345678", 28500);
    expect(p.startsWith("000201010212")).toBe(true);
    expect(p).toContain("29370016A000000677010111011300668123456785303764");
    expect(p).toContain("5406285.005802TH6304");
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
  });
});

describe("checkSlip", () => {
  const slip = { ref: "R1", amountSatang: 28500, receiverAccounts: ["xxx-x-x5678-x"], transferredAt: new Date("2026-11-01T10:00:00Z") };
  const expect_ = { amountSatang: 28500, companyAccounts: ["123-4-55678-9"], notBefore: new Date("2026-11-01T09:00:00Z"), refAlreadyUsed: false };
  it("accepts a good slip", () => expect(checkSlip(slip, expect_)).toBeNull());
  it("accepts overpayment", () => expect(checkSlip({ ...slip, amountSatang: 30000 }, expect_)).toBeNull());
  it("rejects less than due", () => expect(checkSlip({ ...slip, amountSatang: 28499 }, expect_)).toBe("AMOUNT_MISMATCH"));
  it("rejects another receiver", () => expect(checkSlip({ ...slip, receiverAccounts: ["xxx-x-x9999-x"] }, expect_)).toBe("RECEIVER_MISMATCH"));
  it("rejects a reused slip", () => expect(checkSlip(slip, { ...expect_, refAlreadyUsed: true })).toBe("DUPLICATE"));
  it("rejects a transfer made before the booking", () =>
    expect(checkSlip({ ...slip, transferredAt: new Date("2026-11-01T08:00:00Z") }, expect_)).toBe("TOO_OLD"));
  it("matches masked accounts and promptpay tails", () => {
    expect(accountMatches("xxx-x-x5678-x", "123-4-55678-9")).toBe(true);
    expect(accountMatches("0812345678", "0812345678")).toBe(true);
    expect(accountMatches("x-xxxx-5678", "0812345678")).toBe(true);
    expect(accountMatches("x-xxxx-1111", "0812345678")).toBe(false);
  });
});
