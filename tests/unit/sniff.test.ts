import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { sniffMatches } = await import("@/adapters/storage");

const buf = (bytes: number[] | string) =>
  (typeof bytes === "string" ? new TextEncoder().encode(bytes) : new Uint8Array(bytes)).buffer as ArrayBuffer;

describe("upload sniffing", () => {
  it("accepts real signatures", () => {
    expect(sniffMatches(buf([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBe(true);
    expect(sniffMatches(buf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), "image/png")).toBe(true);
    expect(sniffMatches(buf("RIFF....WEBPVP8 "), "image/webp")).toBe(true);
    expect(sniffMatches(buf("%PDF-1.7"), "application/pdf")).toBe(true);
  });
  it("rejects disguised files", () => {
    expect(sniffMatches(buf("<svg onload=alert(1)>"), "image/png")).toBe(false);
    expect(sniffMatches(buf("%PDF-1.7"), "image/jpeg")).toBe(false);
    expect(sniffMatches(buf([0xff, 0xd8, 0xff]), "text/html")).toBe(false);
  });
});
