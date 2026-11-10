import { describe, expect, it } from "vitest";
import { isBot, isCountedPath, normalizePath, projectMonthEnd, quotaLevel, referrerHost } from "@/domain/analytics";

describe("page view analytics", () => {
  it("normalizes ids and drops query strings", () => {
    expect(normalizePath("/liff/customer/quotes/123e4567-e89b-42d3-a456-426614174000?x=1")).toBe("/liff/customer/quotes/:id");
    expect(normalizePath("/l/daily_charter/?gclid=abc")).toBe("/l/daily_charter");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath(`/${"a".repeat(200)}`)).toBeNull();
  });

  it("counts customer pages only", () => {
    expect(isCountedPath("/")).toBe(true);
    expect(isCountedPath("/liff/customer/quote")).toBe(true);
    expect(isCountedPath("/admin")).toBe(false);
    expect(isCountedPath("/admin/usage")).toBe(false);
    expect(isCountedPath("/liff/driver")).toBe(false);
    expect(isCountedPath("/api/health")).toBe(false);
    expect(isCountedPath("/administrator-guide")).toBe(true);
  });

  it("ignores bots and missing user agents", () => {
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Line/14.0")).toBe(false);
    expect(isBot("Googlebot/2.1")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("")).toBe(true);
  });

  it("keeps only the referring site's host", () => {
    expect(referrerHost("https://www.facebook.com/some/post?id=1", "avera.example")).toBe("facebook.com");
    expect(referrerHost("https://avera.example/l/x", "avera.example")).toBeNull();
    expect(referrerHost("not a url", "avera.example")).toBeNull();
  });

  it("grades quota usage and projects month end", () => {
    expect(quotaLevel(120, 300)).toEqual({ pct: 40, level: "ok" });
    expect(quotaLevel(250, 300)).toEqual({ pct: 83, level: "warn" });
    expect(quotaLevel(299, 300)).toEqual({ pct: 99, level: "bad" });
    expect(quotaLevel(10, null)).toEqual({ pct: null, level: "ok" });
    expect(projectMonthEnd(100, 10, 30)).toBe(300);
  });
});
