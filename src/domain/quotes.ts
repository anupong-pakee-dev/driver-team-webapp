// FR-BOOK-01/02, BR-QUOTE — ตรวจคำขอราคาก่อนคำนวณ (กฎล้วน)

export type ServiceType = "airport_transfer" | "point_to_point" | "hourly_charter" | "daily_charter" | "driver_only";
export type Place = { place_id: string; name: string; lat?: number; lng?: number };

export type QuoteRequest = {
  service_type: ServiceType;
  car_type: string;
  origin: Place;
  destination: Place | null;
  stops: Place[];
  pickup_at: string;
  hours: number | null;
  pax: number;
  luggage: number;
  child_seats: number;
  flight: { no: string | null; airport: "BKK" | "DMK"; direction: "arrival" | "departure" } | null;
  no_flight: boolean;
};

export type Capacity = { seats?: number; luggage?: number };

export type QuoteRuleError =
  | "PAX_EXCEEDS_SEATS" | "LUGGAGE_EXCEEDS_CAPACITY" | "FLIGHT_REQUIRED" | "DESTINATION_REQUIRED"
  | "HOURS_REQUIRED" | "PICKUP_TOO_SOON" | "TOO_MANY_STOPS";

export const CHARTER_SERVICES: ServiceType[] = ["hourly_charter", "daily_charter", "driver_only"];
export const MAX_STOPS = 5;

/** คืนรายการข้อผิดพลาด (ว่าง = ผ่าน) */
export function validateQuoteRequest(r: QuoteRequest, cap: Capacity, now: Date, minLeadMinutes: number): QuoteRuleError[] {
  const errors: QuoteRuleError[] = [];
  if (r.car_type !== "driver_only") {
    if (cap.seats !== undefined && r.pax > cap.seats) errors.push("PAX_EXCEEDS_SEATS");
    if (cap.luggage !== undefined && r.luggage > cap.luggage) errors.push("LUGGAGE_EXCEEDS_CAPACITY");
  }
  // FR-BOOK-02: สนามบินต้องมีเลขเที่ยวบิน เว้นแต่เลือก "ไม่มีเที่ยวบิน"
  if (r.service_type === "airport_transfer" && !r.no_flight && !r.flight?.no?.trim()) errors.push("FLIGHT_REQUIRED");
  if (!CHARTER_SERVICES.includes(r.service_type) && !r.destination) errors.push("DESTINATION_REQUIRED");
  if (CHARTER_SERVICES.includes(r.service_type) && !(r.hours && r.hours > 0)) errors.push("HOURS_REQUIRED");
  if (r.stops.length > MAX_STOPS) errors.push("TOO_MANY_STOPS");
  if (Date.parse(r.pickup_at) - now.getTime() < minLeadMinutes * 60_000) errors.push("PICKUP_TOO_SOON");
  return errors;
}

/** เลขเที่ยวบิน: ตัวพิมพ์ใหญ่ ไม่มีช่องว่าง เช่น "tg 123" → "TG123" */
export const normalizeFlightNo = (s: string) => s.toUpperCase().replace(/\s+/g, "");

/** เวลาจบโดยประมาณ (ใช้กันงานชนเวลาตอน dispatch) */
export function estimatedEnd(pickupAt: string, durationS: number, hours: number | null): Date {
  const ms = hours ? hours * 3_600_000 : Math.max(durationS, 1800) * 1000;
  return new Date(Date.parse(pickupAt) + ms);
}

export const QUOTE_INCLUDES = ["fuel", "driver"] as const;
export const QUOTE_EXCLUDES = ["tolls", "parking", "driver_lodging"] as const;
