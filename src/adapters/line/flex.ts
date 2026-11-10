import type { Messages } from "@/i18n";

// §9.1 Flex Message ใบเสนอราคา (FR-QUOTE-01) — ไม่มีข้อมูลส่วนบุคคลในข้อความ มีแค่ลิงก์ไปหน้าที่ตรวจสิทธิ์ · ข้อความตามภาษาลูกค้า

const NAVY = "#13294B";
const AMBER = "#F2A900";

const baht = (satang: number) =>
  `${(satang / 100).toLocaleString("th-TH", { minimumFractionDigits: satang % 100 ? 2 : 0, maximumFractionDigits: 2 })}฿`;

export function quoteFlex(q: {
  number: string;
  revision: number;
  serviceLabel: string;
  carLabel: string;
  route: string;
  pickupText: string;
  finalSatang: number;
  depositSatang: number;
  expiresText: string;
  url: string;
}, t: Messages["line"]) {
  const row = (label: string, value: string, bold = false) => ({
    type: "box", layout: "baseline", spacing: "sm",
    contents: [
      { type: "text", text: label, color: "#5B6575", size: "sm", flex: 2 },
      { type: "text", text: value, wrap: true, size: "sm", flex: 5, ...(bold ? { weight: "bold", color: NAVY } : {}) },
    ],
  });
  return {
    type: "flex",
    altText: t.quoteAlt(q.number, baht(q.finalSatang)),
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: NAVY, paddingAll: "16px",
        contents: [
          { type: "text", text: t.quote, color: "#F6C75A", size: "sm" },
          { type: "text", text: `${q.number}${q.revision > 1 ? ` rev.${q.revision}` : ""}`, color: "#FFFFFF", weight: "bold", size: "lg" },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          row(t.service, `${q.serviceLabel} · ${q.carLabel}`),
          row(t.route, q.route),
          row(t.when, q.pickupText),
          { type: "separator", margin: "md" },
          row(t.price, baht(q.finalSatang), true),
          row(t.deposit, baht(q.depositSatang)),
          { type: "text", text: t.quoteNote(q.expiresText), size: "xs", color: "#5B6575", wrap: true, margin: "md" },
        ],
      },
      footer: {
        type: "box", layout: "vertical",
        contents: [{ type: "button", style: "primary", color: AMBER, action: { type: "uri", label: t.viewQuote, uri: q.url } }],
      },
    },
  };
}

/** ข้อเสนองานถึงคนขับ (FR-DISP-01) — ไม่มีชื่อ/เบอร์ลูกค้า · ปุ่ม postback รับ/ปฏิเสธ + ลิงก์ดูรายละเอียด */
export function offerFlex(o: {
  offerId: string; serviceLabel: string; carLabel: string; route: string; pickupText: string;
  payText: string; expiresText: string; url: string;
}) {
  const text = (t: string, extra: Record<string, unknown> = {}) => ({ type: "text", text: t, wrap: true, size: "sm", ...extra });
  return {
    type: "flex",
    altText: `งานใหม่ ${o.pickupText} · ตอบภายใน ${o.expiresText}`,
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: NAVY, paddingAll: "16px",
        contents: [
          { type: "text", text: "งานใหม่", color: "#F6C75A", size: "sm" },
          { type: "text", text: o.pickupText, color: "#FFFFFF", weight: "bold", size: "lg", wrap: true },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          text(`${o.serviceLabel} · ${o.carLabel}`, { weight: "bold" }),
          text(o.route),
          text(`ค่างาน ${o.payText}`),
          text(`ตอบภายใน ${o.expiresText}`, { color: "#B45309", size: "xs" }),
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "button", style: "primary", color: AMBER, action: { type: "postback", label: "รับงาน", data: `offer:accept:${o.offerId}`, displayText: "รับงาน" } },
          { type: "button", style: "secondary", action: { type: "postback", label: "ปฏิเสธ", data: `offer:reject:${o.offerId}`, displayText: "ปฏิเสธงาน" } },
          { type: "button", style: "link", action: { type: "uri", label: "ดูรายละเอียด", uri: o.url } },
        ],
      },
    },
  };
}
