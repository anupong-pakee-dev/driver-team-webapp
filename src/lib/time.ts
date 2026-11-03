// P6: เก็บ UTC แสดงเป็น Asia/Bangkok

export const TZ = "Asia/Bangkok";
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export function formatBangkok(d: Date | string, locale: "th" | "en" = "th"): string {
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
    timeZone: TZ,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(typeof d === "string" ? new Date(d) : d);
}

/** ค่า datetime-local (YYYY-MM-DDTHH:mm) ตามเวลาไทย หลังจากนี้ minutesAhead นาที */
export function bangkokLocalInput(minutesAhead = 0, from = new Date()): string {
  return new Date(from.getTime() + minutesAhead * MINUTE + 7 * HOUR).toISOString().slice(0, 16);
}
