import { describe, expect, it } from "vitest";
import { payoutItem, sumItems, type PayoutRules } from "@/domain/payout";
import { pickClickId, platformFromParams, resolveSource, SLUG } from "@/domain/attribution";

const rules: PayoutRules = { commissionRate: 0.2, whtRate: null, whtBase: "after_commission", commissionOnCancellation: false, penaltiesEnabled: false };

describe("payoutItem (§7.5, every component)", () => {
  it("design doc example: gross 950 · commission 190 · tolls 50", () => {
    expect(payoutItem({ kind: "job", grossSatang: 95000, reimburseSatang: 5000 }, rules))
      .toEqual({ gross: 95000, commission: 19000, withholding: 0, penalties: 0, reimburse: 5000, net: 81000 });
  });
  it("withholding on after-commission base (net = 810 − 760r)", () => {
    const r = payoutItem({ kind: "job", grossSatang: 95000, reimburseSatang: 5000 }, { ...rules, whtRate: 0.03 });
    expect(r.withholding).toBe(2280);
    expect(r.net).toBe(81000 - 2280);
  });
  it("withholding on gross base", () => {
    expect(payoutItem({ kind: "job", grossSatang: 95000 }, { ...rules, whtRate: 0.03, whtBase: "gross" }).withholding).toBe(2850);
  });
  it("penalties only when the flag is on", () => {
    expect(payoutItem({ kind: "job", grossSatang: 95000, penaltiesSatang: 10000 }, rules).penalties).toBe(0);
    expect(payoutItem({ kind: "job", grossSatang: 95000, penaltiesSatang: 10000 }, { ...rules, penaltiesEnabled: true }).net).toBe(66000);
  });
  it("reimbursement is never commissioned", () => {
    const a = payoutItem({ kind: "job", grossSatang: 0, reimburseSatang: 12345 }, rules);
    expect(a).toMatchObject({ commission: 0, net: 12345 });
  });
  it("cancellation share: no commission by default (T9), configurable", () => {
    expect(payoutItem({ kind: "cancellation", grossSatang: 7125 }, rules).net).toBe(7125);
    expect(payoutItem({ kind: "cancellation", grossSatang: 7125 }, { ...rules, commissionOnCancellation: true }).commission).toBe(1425);
  });
  it("property: parts always add up to net, sums are additive", () => {
    const items = [101, 95000, 33333, 7125, 1].map((g, i) =>
      payoutItem({ kind: i % 2 ? "cancellation" : "job", grossSatang: g, reimburseSatang: i * 7 }, { ...rules, whtRate: 0.03, commissionOnCancellation: true }));
    for (const x of items) expect(x.gross - x.commission - x.withholding - x.penalties + x.reimburse).toBe(x.net);
    const s = sumItems(items);
    expect(s.net).toBe(items.reduce((a, x) => a + x.net, 0));
    expect(s.gross - s.commission - s.withholding - s.penalties + s.reimburse).toBe(s.net);
  });
});

describe("attribution (§7.7)", () => {
  it("keeps click id case as given", () => expect(pickClickId({ gclid: "Cj0KCQ-AbC" })).toEqual({ type: "gclid", id: "Cj0KCQ-AbC" }));
  it("maps params to platforms", () => {
    expect(platformFromParams({ fbclid: "x" })).toBe("meta");
    expect(platformFromParams({ utm_source: "Instagram" })).toBe("meta");
    expect(platformFromParams({ utm_source: "newsletter" })).toBeNull();
  });
  it("never leaves the source empty", () => {
    expect(resolveSource({ touchCampaignPlatform: "offline", sourceAnswer: "facebook" })).toBe("offline");
    expect(resolveSource({ sourceAnswer: "friend" })).toBe("referral");
    expect(resolveSource({})).toBe("unknown");
  });
  it("validates slugs", () => {
    expect(SLUG.test("hotel-a-qr")).toBe(true);
    expect(SLUG.test("Bad Slug")).toBe(false);
    expect(SLUG.test("-x")).toBe(false);
  });
});
