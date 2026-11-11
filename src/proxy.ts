import { NextResponse, type NextRequest } from "next/server";

// §13.1 CSRF: POST/PUT/DELETE ใน /api ต้องมาจาก origin เดียวกัน (ยกเว้น webhook และ job ที่ตรวจลายเซ็น/secret เอง)
// + กันหน้าแอดมินแบบ optimistic (การตรวจสิทธิ์จริงอยู่ใน requireUser/requireStaffPage ฝั่งเซิร์ฟเวอร์)
// + §14 degraded mode: MAINTENANCE_MODE=true → ทุกหน้าไปหน้าแจ้งปิดปรับปรุง (รับจองทางแชทแทน) · API ตอบ 503

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (process.env.MAINTENANCE_MODE === "true") {
    if (pathname === "/maintenance" || pathname === "/api/health") return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "MAINTENANCE", message_th: "ระบบปิดปรับปรุงชั่วคราว", message_en: "Under maintenance", details: {} } },
        { status: 503, headers: { "retry-after": "300" } },
      );
    }
    return NextResponse.rewrite(new URL("/maintenance", req.url), { status: 503 });
  }

  if (pathname.startsWith("/api/") && UNSAFE.has(req.method)
      && !pathname.startsWith("/api/webhooks/") && !pathname.startsWith("/api/jobs/")) {
    const origin = req.headers.get("origin");
    if (!origin || new URL(origin).host !== req.headers.get("host")) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message_th: "ไม่มีสิทธิ์", message_en: "Bad origin", details: {} } },
        { status: 403 },
      );
    }
  }

  if (pathname.startsWith("/admin") && pathname !== "/admin/login" && pathname !== "/admin/join" && !req.cookies.has("sid")) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // ทุกหน้า ยกเว้นไฟล์ static ของ Next และ favicon
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
