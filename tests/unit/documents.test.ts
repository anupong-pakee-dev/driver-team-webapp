import { describe, expect, it } from "vitest";
import { DOC_TYPES, DocDataError, approvalPatch, docType, parseDocData, reminderDue } from "@/domain/documents";

const allowed = { registration_types: ["ry1", "ry10"], license_classes: ["car_public"] };

describe("parseDocData", () => {
  it("splits public and secret values and picks the expiry", () => {
    const out = parseDocData(docType("public_license")!, { license_no: "12 345-678", license_class: "car_public", expiry: "2027-05-01" }, allowed);
    expect(out).toEqual({ data: { license_class: "car_public", expiry: "2027-05-01" }, secret: { license_no: "12345678" }, expiresAt: "2027-05-01" });
  });

  it("stores money as satang", () => {
    const out = parseDocData(docType("passenger_ins")!, { sum_baht: "200000", expiry: "2027-01-01" }, allowed);
    expect(out.data.sum_baht).toBe(20_000_000);
  });

  it("rejects missing required fields", () => {
    expect(() => parseDocData(docType("compulsory_ins")!, {}, allowed)).toThrow(DocDataError);
  });

  it("rejects options outside the configured list", () => {
    expect(() => parseDocData(docType("registration_book")!, { registration_type: "ry99", owner_name: "x" }, allowed))
      .toThrow(/registration_type: invalid/);
    expect(() => parseDocData(docType("voluntary_ins")!, {
      insurer: "a", policy_no: "b", usage: "personal", expiry: "2027-01-01", claim_phone: "1557",
    }, allowed)).toThrow(/usage: invalid/);
  });

  it("rejects malformed dates", () => {
    expect(() => parseDocData(docType("tax_receipt")!, { expiry: "01/02/2027" }, allowed)).toThrow(/expiry: invalid/);
  });
});

describe("approvalPatch", () => {
  it("maps voluntary insurance fields to vehicle columns", () => {
    expect(approvalPatch("voluntary_ins", { insurer: "A", policy_no: "P1", usage: "commercial_hire", expiry: "2027-01-01", claim_phone: "1557" }, {}))
      .toEqual({
        voluntary_insurer: "A", voluntary_policy_no: "P1", voluntary_insurance_usage: "commercial_hire",
        voluntary_insurance_expiry: "2027-01-01", insurance_claim_phone: "1557",
      });
  });
  it("keeps only last 4 of the bank account in clear", () => {
    expect(approvalPatch("bank_book", { bank_name: "K" }, { account_no: "1234567890" }))
      .toEqual({ bank_account: "1234567890", bank_account_last4: "7890" });
  });
  it("every doc type with an expiry field maps that expiry somewhere", () => {
    for (const t of DOC_TYPES.filter((d) => d.expiryField)) {
      const patch = approvalPatch(t.type, { [t.expiryField!]: "2027-01-01" }, {});
      expect(Object.values(patch)).toContain("2027-01-01");
    }
  });
});

describe("reminderDue (FR-VEH-05)", () => {
  const days = [30, 7, 1];
  it.each([
    ["2026-12-01", "2026-11-01", 30],
    ["2026-11-08", "2026-11-01", 7],
    ["2026-11-02", "2026-11-01", 1],
    ["2026-11-10", "2026-11-01", null],
    ["2026-11-01", "2026-11-01", null],
  ])("expires %s, today %s → %s", (exp, today, out) => expect(reminderDue(exp, today, days)).toBe(out));
});
