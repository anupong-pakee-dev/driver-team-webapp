// §15 Load (เบา) — NFR-03: 50 ผู้ใช้พร้อมกัน, p95 < 500 ms (ไม่รวมเรียก Routes API)
// รันกับ production build:
//   docker run --rm -i -e BASE=http://host.docker.internal:3001 -e EMAIL=... -e PASSWORD=... [-e MODE=stress] grafana/k6:0.54.0 run - < tests/load/k6.js
// MODE=realistic (ค่าเริ่ม): ผู้ใช้ 50 คนเปิดทีละหน้า คิด 2–5 วินาทีระหว่างหน้า (พฤติกรรมคนจริง) — ใช้ตัดสิน NFR-03
// MODE=stress: 50 VU ยิง 5 หน้าต่อวินาทีต่อคน (~85 req/s) — ดูเพดานของเครื่อง/instance เดียว ไม่ใช่เกณฑ์ผ่าน
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE || "http://localhost:3001";
const STRESS = __ENV.MODE === "stress";

export const options = {
  scenarios: {
    users: { executor: "constant-vus", vus: Number(__ENV.VUS || 50), duration: __ENV.DURATION || "60s" },
  },
  thresholds: STRESS ? { http_req_failed: ["rate<0.01"] } : {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
    "http_req_duration{page:catalog}": ["p(95)<500"],
    "http_req_duration{page:admin_inbox}": ["p(95)<500"],
    "http_req_duration{page:admin_bookings}": ["p(95)<500"],
  },
};

// login ครั้งเดียว (admin login มี rate limit) แล้วแชร์ session ให้ทุก VU
export function setup() {
  const res = http.post(`${BASE}/api/auth/admin`, JSON.stringify({ email: __ENV.EMAIL, password: __ENV.PASSWORD }), {
    headers: { "content-type": "application/json", origin: BASE },
  });
  const m = /sid=([^;]+)/.exec(res.headers["Set-Cookie"] || "");
  if (!m) throw new Error(`login failed: ${res.status}`);
  return { sid: m[1] };
}

const PAGES = [
  // [ชื่อ, path, ต้อง login, น้ำหนัก] — ลูกค้าจากแอดเปิดแคตตาล็อกมากที่สุด
  ["catalog", "/", false, 5],
  ["health", "/api/health", false, 1],
  ["me", "/api/me", true, 2],
  ["admin_inbox", "/admin", true, 1],
  ["admin_bookings", "/admin/bookings", true, 1],
];
const BAG = PAGES.flatMap((p) => Array(p[3]).fill(p));

function hit(p, sid) {
  const params = { tags: { page: p[0] }, redirects: 0, headers: p[2] ? { cookie: `sid=${sid}` } : {} };
  check(http.get(`${BASE}${p[1]}`, params), { [`${p[0]} 200`]: (r) => r.status === 200 });
}

export default function browse(data) {
  if (STRESS) {
    for (const p of PAGES) hit(p, data.sid);
    sleep(1);
    return;
  }
  hit(BAG[Math.floor(Math.random() * BAG.length)], data.sid);
  sleep(2 + Math.random() * 3);
}
