import { describe, expect, it } from "vitest";
import { LINE_PUSH_DEFAULTS, linePushAllowed, linePushCategory } from "@/domain/linePush";

describe("line push categories", () => {
  it("maps dedupe keys to categories", () => {
    expect(linePushCategory("quote:abc")).toBe("quotes");
    expect(linePushCategory("offer:abc")).toBe("offers");
    expect(linePushCategory("taken:abc")).toBe("job_closed");
    expect(linePushCategory("paid:abc")).toBe("payments");
    expect(linePushCategory("slip-review:abc:file:u1")).toBe("staff");
    expect(linePushCategory("something-new:1")).toBeNull();
  });

  it("uses the owner's defaults when the setting is missing", () => {
    expect(linePushAllowed("quote:1", null)).toBe(true);
    expect(linePushAllowed("offer:1", null)).toBe(true);
    expect(linePushAllowed("remind:1:day", null)).toBe(true);
    expect(linePushAllowed("paid:1", null)).toBe(false);
    expect(linePushAllowed("doc-review:1", null)).toBe(false);
    expect(linePushAllowed("new-device:u1", null)).toBe(false);
  });

  it("follows the setting, and sends unknown keys rather than dropping them", () => {
    expect(linePushAllowed("paid:1", { payments: true })).toBe(true);
    expect(linePushAllowed("offer:1", { offers: false })).toBe(false);
    expect(linePushAllowed("brand-new:1", { staff: false })).toBe(true);
    expect(linePushAllowed(undefined, {})).toBe(true);
  });

  it("keeps the five chosen categories on by default", () => {
    expect(Object.entries(LINE_PUSH_DEFAULTS).filter(([, on]) => on).map(([k]) => k).sort())
      .toEqual(["booking", "job_closed", "offers", "quotes", "reminders"]);
  });
});
