import { describe, expect, it } from "vitest";
import { estimateRoute, haversineM, inThailand, navLinks, parseMapsLink } from "@/domain/geo";

describe("parseMapsLink", () => {
  it("reads plain coordinates", () => {
    expect(parseMapsLink("13.7462, 100.5347")).toEqual({ lat: 13.7462, lng: 100.5347 });
    expect(parseMapsLink(" 13.7462,100.5347 ")).toEqual({ lat: 13.7462, lng: 100.5347 });
  });

  it("prefers the place pin over the map centre and keeps the place name", () => {
    const url = "https://www.google.com/maps/place/Siam+Paragon/@13.7460,100.5340,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d13.7462!4d100.5347!16s";
    expect(parseMapsLink(url)).toEqual({ lat: 13.7462, lng: 100.5347, name: "Siam Paragon" });
  });

  it("decodes Thai place names", () => {
    const url = "https://www.google.com/maps/place/%E0%B8%AA%E0%B8%A2%E0%B8%B2%E0%B8%A1/@13.74,100.53,17z";
    expect(parseMapsLink(url)).toEqual({ lat: 13.74, lng: 100.53, name: "สยาม" });
  });

  it("reads coordinate query parameters", () => {
    expect(parseMapsLink("https://maps.google.com/?q=13.7462,100.5347")).toEqual({ lat: 13.7462, lng: 100.5347 });
    expect(parseMapsLink("https://www.google.com/maps/search/?api=1&query=13.7,100.5")).toEqual({ lat: 13.7, lng: 100.5 });
    expect(parseMapsLink("https://www.google.com/maps/search/13.7462,+100.5347")).toEqual({ lat: 13.7462, lng: 100.5347 });
  });

  it("falls back to the map centre", () => {
    expect(parseMapsLink("https://www.google.com/maps/@13.75,100.49,15z")).toEqual({ lat: 13.75, lng: 100.49 });
  });

  it("returns null for links without coordinates or from other sites", () => {
    expect(parseMapsLink("https://www.google.com/maps/search/?api=1&query=Siam+Paragon")).toBeNull();
    expect(parseMapsLink("https://evil.example/maps/@13.7,100.5,15z")).toBeNull();
    expect(parseMapsLink("https://www.google.com/search?q=13.7,100.5")).toBeNull();
    expect(parseMapsLink("not a link")).toBeNull();
  });
});

describe("estimateRoute", () => {
  const bkk = { lat: 13.69, lng: 100.7501 };
  const silom = { lat: 13.729, lng: 100.534 };

  it("applies the road factor and average speed through every point", () => {
    const straight = haversineM(bkk, silom);
    const r = estimateRoute([bkk, silom], { road_factor: 1.35, avg_kmh: 50 });
    expect(r.distanceM).toBe(Math.round(straight * 1.35));
    expect(r.durationS).toBe(Math.round((straight * 1.35) / 1000 / 50 * 3600));
    expect(estimateRoute([bkk, silom, bkk]).distanceM).toBe(Math.round(straight * 1.35 * 2));
  });

  it("is zero for a single point", () => expect(estimateRoute([bkk])).toEqual({ distanceM: 0, durationS: 0 }));
});

describe("inThailand / navLinks", () => {
  it("rejects swapped or foreign coordinates", () => {
    expect(inThailand({ lat: 13.7, lng: 100.5 })).toBe(true);
    expect(inThailand({ lat: 100.5, lng: 13.7 })).toBe(false);
    expect(inThailand({ lat: 1.35, lng: 103.8 })).toBe(false); // สิงคโปร์
  });
  it("builds navigation links from coordinates", () => {
    expect(navLinks({ lat: 13.7, lng: 100.5 })).toEqual({
      google: "https://www.google.com/maps/dir/?api=1&destination=13.7,100.5",
      waze: "https://waze.com/ul?ll=13.7,100.5&navigate=yes",
    });
  });
});
