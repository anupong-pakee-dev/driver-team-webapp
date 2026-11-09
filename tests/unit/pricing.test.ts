import { describe, expect, it } from "vitest";
import { PricingError, checkDiscount, depositFor, extrasFor, price, roundUp10Baht, type PriceRule } from "@/domain/pricing";
import { estimatedEnd, normalizeFlightNo, validateQuoteRequest, type QuoteRequest } from "@/domain/quotes";

const sedanAirport: PriceRule = {
  id: "r", base_satang: 80000, included_km: 40, per_km_satang: 1200, included_minutes: 180,
  ot_per_hour_satang: 20000, floor_satang: 70000,
};

describe("price (§7.1)", () => {
  it("matches the worked example in the design doc: 51.3 km → 950 บาท", () => {
    const b = price({ rule: sedanAirport, distanceM: 51_300, durationS: 3600, extrasSatang: 0 });
    expect(b).toMatchObject({ km: 52, extra_km: 12, ot_hours: 0, subtotal: 94400, computed: 95000 });
    expect(depositFor(b.computed, 0.3)).toBe(28500);
  });

  it("charges nothing extra within included km", () => {
    expect(price({ rule: sedanAirport, distanceM: 39_999, durationS: 3000, extrasSatang: 0 }).computed).toBe(80000);
  });

  it("charter uses chosen hours for OT, rounded up per hour", () => {
    const rule = { ...sedanAirport, included_minutes: 300, included_km: 100 };
    const b = price({ rule, distanceM: 20_000, durationS: 1200, hours: 7, extrasSatang: 0 });
    expect(b.ot_hours).toBe(2);
    expect(b.computed).toBe(80000 + 2 * 20000);
  });

  it("adds extras and rounds up to 10 baht", () => {
    const b = price({ rule: sedanAirport, distanceM: 10_000, durationS: 600, extrasSatang: extrasFor({ child_seat_satang: 15050, stop_satang: 0 }, 1, 0) });
    expect(b.subtotal).toBe(95050);
    expect(b.computed).toBe(96000);
  });

  it("roundUp10Baht leaves exact multiples alone", () => {
    expect(roundUp10Baht(95000)).toBe(95000);
    expect(roundUp10Baht(95001)).toBe(96000);
  });
});

describe("checkDiscount (BR-PRICE-01/02)", () => {
  it("sales_admin ≤ 10% is immediate", () => expect(checkDiscount(95000, 9500, 70000, "sales_admin", 0.1)).toBe("ok"));
  it("sales_admin > 10% needs owner approval", () => expect(checkDiscount(95000, 9510, 70000, "sales_admin", 0.1)).toBe("pending_approval"));
  it("owner above cap is immediate", () => expect(checkDiscount(95000, 20000, 70000, "owner", 0.1)).toBe("ok"));
  it("below floor is rejected for everyone", () => {
    expect(() => checkDiscount(95000, 25001, 70000, "owner", 0.1)).toThrow(PricingError);
    expect(() => checkDiscount(95000, 25001, 70000, "sales_admin", 0.1)).toThrow("BELOW_FLOOR");
  });
  it("rejects negative or fractional discounts", () => {
    expect(() => checkDiscount(95000, -1, 70000, "owner", 0.1)).toThrow("INVALID_DISCOUNT");
    expect(() => checkDiscount(95000, 1.5, 70000, "owner", 0.1)).toThrow("INVALID_DISCOUNT");
  });
});

describe("validateQuoteRequest (FR-BOOK-01/02)", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  const base: QuoteRequest = {
    service_type: "airport_transfer", car_type: "sedan",
    origin: { name: "สุวรรณภูมิ", lat: 13.69, lng: 100.7501 }, destination: { name: "โรงแรม", lat: 13.729, lng: 100.534 }, stops: [],
    pickup_at: "2026-11-02T00:00:00Z", hours: null, pax: 2, luggage: 2, child_seats: 0,
    flight: { no: "TG123", airport: "BKK", direction: "arrival" }, no_flight: false,
  };
  it("passes a valid airport request", () => expect(validateQuoteRequest(base, { seats: 3, luggage: 2 }, now, 120)).toEqual([]));
  it("requires a flight number unless no_flight", () => {
    expect(validateQuoteRequest({ ...base, flight: null }, {}, now, 120)).toEqual(["FLIGHT_REQUIRED"]);
    expect(validateQuoteRequest({ ...base, flight: null, no_flight: true }, {}, now, 120)).toEqual([]);
  });
  it("checks pax and luggage against capacity", () => {
    expect(validateQuoteRequest({ ...base, pax: 4, luggage: 3 }, { seats: 3, luggage: 2 }, now, 120))
      .toEqual(["PAX_EXCEEDS_SEATS", "LUGGAGE_EXCEEDS_CAPACITY"]);
  });
  it("charters need hours, transfers need a destination", () => {
    expect(validateQuoteRequest({ ...base, service_type: "hourly_charter", flight: null }, {}, now, 120)).toEqual(["HOURS_REQUIRED"]);
    expect(validateQuoteRequest({ ...base, service_type: "point_to_point", destination: null }, {}, now, 120)).toEqual(["DESTINATION_REQUIRED"]);
  });
  it("rejects pickups inside the lead time", () => {
    expect(validateQuoteRequest({ ...base, pickup_at: "2026-11-01T01:00:00Z" }, {}, now, 120)).toEqual(["PICKUP_TOO_SOON"]);
  });
  it("normalizes flight numbers and estimates end time", () => {
    expect(normalizeFlightNo(" tg 123 ")).toBe("TG123");
    expect(estimatedEnd("2026-11-02T00:00:00Z", 3600, null).toISOString()).toBe("2026-11-02T01:00:00.000Z");
    expect(estimatedEnd("2026-11-02T00:00:00Z", 3600, 5).toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });
});
