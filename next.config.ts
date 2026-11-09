import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// §13.1 XSS / clickjacking: CSP + header ความปลอดภัย
// - LIFF SDK เรียก *.line.me · Meta Pixel โหลดหลังยินยอมเท่านั้น (connect.facebook.net)
// - ฟอนต์ self-host ผ่าน next/font · Next ต้องใช้ inline script ตอน hydrate ('unsafe-inline'; dev ต้อง 'unsafe-eval')
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://connect.facebook.net`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.line.me https://*.line-scdn.net https://www.facebook.com${dev ? " ws: http://127.0.0.1:54321" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // GPS ตอนเช็กอิน + กล้องถ่ายรูปรับ/ส่ง ใช้ได้เฉพาะเว็บเรา
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=()" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  // ปิด Cache Components: แทบทุกหน้าอ่านข้อมูลต่อผู้ใช้จาก DB ตอน request (RLS) — render แบบ dynamic ตรงไปตรงมากว่า
  cacheComponents: false,
  // pg ใช้ native module ฝั่ง Node เท่านั้น
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
