import { describe, expect, it } from "vitest";
import { contactAllowed, distanceM, offerTtlMinutes, onePerDriver, rankCandidates, waitFee } from "@/domain/dispatch";

const c = (driverId: string, last: string | null, score = 100, vehicleId: string | null = `${driverId}-v`) =>
  ({ driverId, vehicleId, lastAssignedAt: last ? new Date(last) : null, score });

describe("rankCandidates (BR-DISP-02/03)", () => {
  it("round-robin: never-assigned first, then longest since last job", () => {
    const r = rankCandidates([c("a", "2026-10-30"), c("b", null), c("c", "2026-10-01")], null);
    expect(r.map((x) => x.driverId)).toEqual(["b", "c", "a"]);
  });
  it("preferred driver goes first regardless of queue", () => {
    const r = rankCandidates([c("a", null), c("b", "2026-10-30")], "b");
    expect(r[0].driverId).toBe("b");
  });
  it("ties broken by higher score", () => {
    const r = rankCandidates([c("a", "2026-10-01", 90), c("b", "2026-10-01", 110)], null);
    expect(r[0].driverId).toBe("b");
  });
  it("one vehicle per driver", () => {
    expect(onePerDriver([c("a", null, 100, "v1"), c("a", null, 100, "v2"), c("b", null)]).map((x) => x.vehicleId)).toEqual(["v1", "b-v"]);
  });
});

describe("offerTtlMinutes (BR-DISP-04)", () => {
  const s = { offer_ttl_minutes: 15, offer_ttl_urgent_minutes: 5 };
  const now = new Date("2026-11-01T00:00:00Z");
  it("normal", () => expect(offerTtlMinutes(new Date("2026-11-01T03:00:00Z"), now, s)).toBe(15));
  it("urgent under 3h", () => expect(offerTtlMinutes(new Date("2026-11-01T02:59:00Z"), now, s)).toBe(5));
});

describe("waitFee (§7.6)", () => {
  const base = { pickupAt: new Date("2026-11-01T10:00:00Z"), arriveAt: new Date("2026-11-01T09:50:00Z"), freeMinutes: 30, waitPerHourSatang: 20000 };
  it("free within the allowance", () =>
    expect(waitFee({ ...base, pickedUpAt: new Date("2026-11-01T10:30:00Z") }).feeSatang).toBe(0));
  it("counts from pickup time when the driver is early, rounds up per 30 min", () =>
    expect(waitFee({ ...base, pickedUpAt: new Date("2026-11-01T10:31:00Z") })).toEqual({ waitedMinutes: 31, billableMinutes: 1, feeSatang: 10000 }));
  it("airport arrival counts from landing time", () =>
    expect(waitFee({ ...base, freeMinutes: 60, landedAt: new Date("2026-11-01T10:20:00Z"), pickedUpAt: new Date("2026-11-01T11:51:00Z") }).feeSatang).toBe(20000));
});

describe("distance + contact window", () => {
  it("measures metres", () => {
    expect(distanceM({ lat: 13.7462, lng: 100.5347 }, { lat: 13.7462, lng: 100.5347 })).toBe(0);
    const d = distanceM({ lat: 13.69, lng: 100.7501 }, { lat: 13.6945, lng: 100.7501 });
    expect(d).toBeGreaterThan(480);
    expect(d).toBeLessThan(520);
  });
  const pickupAt = new Date("2026-11-01T10:00:00Z");
  const endAt = new Date("2026-11-01T11:00:00Z");
  const at = (iso: string) => contactAllowed({ status: "assigned", pickupAt, endAt, now: new Date(iso), windowHours: 2 });
  it("closed before pickup − 2h", () => expect(at("2026-11-01T07:59:00Z")).toBe(false));
  it("open from pickup − 2h", () => expect(at("2026-11-01T08:00:00Z")).toBe(true));
  it("open until end + 2h", () => expect(at("2026-11-01T13:00:00Z")).toBe(true));
  it("closed after end + 2h", () => expect(at("2026-11-01T13:01:00Z")).toBe(false));
  it("closed once completed", () =>
    expect(contactAllowed({ status: "completed", pickupAt, endAt, now: pickupAt, windowHours: 2 })).toBe(false));
});
