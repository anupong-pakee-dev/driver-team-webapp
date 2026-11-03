import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { devLoginEnabled } from "@/lib/dev";
import { formatBaht } from "@/lib/money";
import { formatBangkok } from "@/lib/time";
import { QUOTE_STATUS_TH } from "@/services/quoteView";
import { BOOKING_STATUS_TH } from "@/services/bookingView";
import { LiffLogin } from "@/components/LiffLogin";
import { LogoutButton } from "@/components/LogoutButton";
import { AppHeader, Badge, Empty, Panel, btnPrimary } from "@/components/ui";

export const dynamic = "force-dynamic";


export default async function CustomerHome() {
  const user = await currentUser();
  if (!user) {
    return (
      <div className="mx-auto w-full max-w-md">
        <AppHeader title="การจองของฉัน" subtitle="เข้าสู่ระบบด้วย LINE" />
        <main className="px-5">
          <LiffLogin app="customer" liffId={process.env.NEXT_PUBLIC_LIFF_ID_CUSTOMER} devLogin={devLoginEnabled()} />
        </main>
      </div>
    );
  }

  // อ่านผ่าน RLS ในนามลูกค้า — เห็นเฉพาะของตัวเอง
  const { quotes, bookings } = await asUser(user.authUserId, async (db) => {
    const q = await db.query(
      `select id, number, revision, status, final_satang, pickup_at from quotes where status <> 'pending_approval' order by created_at desc limit 20`,
    );
    const b = await db.query(`select id, status, pickup_at, price_satang from bookings order by pickup_at desc limit 20`);
    return { quotes: q.rows, bookings: b.rows };
  });

  return (
    <div className="mx-auto w-full max-w-md">
      <AppHeader
        title={`สวัสดี ${user.displayName ?? ""}`}
        subtitle={user.role === "customer" ? "บัญชีลูกค้า" : `บัญชีนี้เป็น ${user.role}`}
        right={<LogoutButton to="/liff/customer" />}
      />
      <main className="space-y-4 px-5 py-4">
        <Link href="/liff/customer/quote" className={`${btnPrimary} w-full`}>
          ขอใบเสนอราคา
        </Link>

        <Panel title="งานของฉัน">
          {bookings.length === 0 ? (
            <Empty>ยังไม่มีการจอง</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {bookings.map((b) => (
                <li key={b.id}>
                  <Link href={`/liff/customer/bookings/${b.id}`} className="flex items-center justify-between py-3">
                    <div>
                      <div className="font-medium">{formatBangkok(b.pickup_at)}</div>
                      <div className="text-sm text-muted">{formatBaht(Number(b.price_satang))}</div>
                    </div>
                    <Badge tone={BOOKING_STATUS_TH[b.status]?.[1] ?? "info"}>{BOOKING_STATUS_TH[b.status]?.[0] ?? b.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="ใบเสนอราคา">
          {quotes.length === 0 ? (
            <Empty>ยังไม่มีใบเสนอราคา</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {quotes.map((q) => (
                <li key={q.id}>
                  <Link href={`/liff/customer/quotes/${q.id}`} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium">
                      {q.number} {q.revision > 1 && <span className="text-muted">rev.{q.revision}</span>}
                    </div>
                    <div className="text-sm text-muted">{formatBangkok(q.pickup_at)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{formatBaht(Number(q.final_satang))}</div>
                    <Badge tone={QUOTE_STATUS_TH[q.status]?.[1] ?? "info"}>{QUOTE_STATUS_TH[q.status]?.[0] ?? q.status}</Badge>
                  </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </main>
    </div>
  );
}
