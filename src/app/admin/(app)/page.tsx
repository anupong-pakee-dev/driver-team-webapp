import Link from "next/link";
import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { formatBangkok } from "@/lib/time";
import { Badge, Panel } from "@/components/ui";

function Box({ title, n, href, children }: { title: string; n: number; href: string; children?: React.ReactNode }) {
  return (
    <Panel>
      <Link href={href} className="flex items-center justify-between">
        <h2 className="font-bold">{title}</h2>
        <Badge tone={n > 0 ? "warn" : "ok"}>{n}</Badge>
      </Link>
      {n > 0 && <div className="mt-2 text-sm">{children}</div>}
    </Panel>
  );
}

// FR-ADMIN-01 กล่องงานวันนี้ — ทุกรายการคลิกไปจัดการได้
export default async function AdminInbox() {
  const user = await requireStaffPage(["sales_admin", "owner"]);
  const isOwner = user.role === "owner";
  // คำสั่งเดียว (ไม่ใช่ 14 รอบ) — หน้านี้เปิดบ่อยที่สุดของหลังบ้าน (NFR-03)
  const d = await asUser(user.authUserId, async (db) => {
    const list = (sql: string) => `coalesce((select json_agg(x) from (${sql}) x), '[]'::json)`;
    const { rows } = await db.query(`select
      ${list(`select b.id, b.pickup_at, b.car_type,
                     (select u.display_name from job_offers o join users u on u.id = o.driver_id
                       where o.booking_id = b.id and o.result = 'pending') as offered_to
                from bookings b where b.status = 'confirmed' order by b.pickup_at limit 20`)} as dispatch,
      ${list(`select b.id, b.pickup_at, b.created_at, b.deposit_satang::int from bookings b
               where b.status = 'awaiting_deposit' order by b.created_at limit 20`)} as deposit,
      ${list(`select id, number, revision, discount_satang::int from quotes where status = 'pending_approval' order by created_at limit 20`)} as discounts,
      ${list(`select p.booking_id, p.amount_satang::int, p.reason from payments p where p.status = 'pending_approval' order by p.created_at limit 20`)} as slips,
      ${list(`select booking_id, amount_satang::int from payments where kind = 'refund' and status = 'pending' order by created_at limit 20`)} as refunds,
      ${list(`select p.id, u.display_name, p.net_satang::int from payouts p join users u on u.id = p.driver_id where p.status = 'ready' order by p.created_at limit 20`)} as payouts,
      ${list(`select i.booking_id, i.type, i.opened_at from incidents i where i.status = 'open' order by i.opened_at limit 20`)} as incidents,
      ${list(`select booking_id, opened_at, description from complaints where status = 'open' order by opened_at limit 20`)} as complaints,
      ${list(`select b.id, b.pickup_at, b.status, u.display_name as driver from bookings b left join users u on u.id = b.driver_id
               where (b.pickup_at at time zone 'Asia/Bangkok')::date = (now() at time zone 'Asia/Bangkok')::date
                 and b.status not in ('cancelled','expired') order by b.pickup_at`)} as today,
      (select count(*)::int from documents d where d.status = 'approved' and d.expires_at <= current_date + 30
         and not exists (select 1 from documents x where x.owner_id = d.owner_id and x.doc_type = d.doc_type
                           and x.status = 'approved' and x.expires_at > d.expires_at)) as expiring,
      (select count(*)::int from documents where status = 'pending') as pending_docs,
      json_build_object(
        'regs', (select count(*) from allowed_registrations)::int, 'cov', (select count(*) from license_coverage)::int,
        'bg', (select value->>'bg_check_valid_years' from settings where key = 'compliance'),
        'wht', (select value->>'rate' from settings where key = 'withholding')) as ready,
      (select count(*)::int from outbox where status = 'dead') as dead`);
    const r = rows[0];
    return { ...r, pendingDocs: r.pending_docs } as {
      dispatch: { id: string; pickup_at: string; offered_to: string | null }[];
      deposit: { id: string; pickup_at: string; deposit_satang: number }[];
      discounts: { id: string; number: string; revision: number; discount_satang: number }[];
      slips: { booking_id: string; amount_satang: number; reason: string }[];
      refunds: { booking_id: string; amount_satang: number }[];
      payouts: { id: string; display_name: string; net_satang: number }[];
      incidents: { booking_id: string; type: string; opened_at: string }[];
      complaints: { booking_id: string; opened_at: string; description: string }[];
      today: { id: string; pickup_at: string; status: string; driver: string | null }[];
      expiring: number; pendingDocs: number; dead: number;
      ready: { regs: number; cov: number; bg: string | null; wht: string | null };
    };
  });


  const setup = [
    { ok: d.ready.regs > 0, label: "ทะเบียนรถที่รับงานได้ (กฎ ขบ.)", href: "/admin/compliance" },
    { ok: d.ready.cov > 0, label: "ใบขับขี่ ↔ ประเภทรถ (กฎ ขบ.)", href: "/admin/compliance" },
    { ok: d.ready.bg !== null, label: "อายุผลตรวจประวัติ (bg_check_valid_years)", href: "/admin/settings" },
    { ok: d.ready.wht !== null, label: "อัตราหัก ณ ที่จ่ายคนขับ (withholding.rate) — นักบัญชี", href: "/admin/settings" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">กล่องงานวันนี้</h1>
      {setup.some((s) => !s.ok) && (
        <Panel title="ยังต้องตั้งค่าก่อนเปิดรับงานจริง">
          <ul className="space-y-1 text-sm">
            {setup.filter((s) => !s.ok).map((s) => <li key={s.label}><Link href={s.href} className="text-warn underline">{s.label}</Link></li>)}
          </ul>
        </Panel>
      )}
      {d.dead > 0 && <p className="rounded-xl bg-bad/10 px-4 py-3 text-sm text-bad">ข้อความแจ้งเตือนส่งไม่สำเร็จ {d.dead} รายการ — โทรแจ้งแทน (§14)</p>}

      <Panel title={`งานวันนี้ (${d.today.length})`}>
        {d.today.length === 0 ? <p className="text-sm text-muted">ไม่มีงานวันนี้</p> : (
          <ul className="divide-y divide-line text-sm">
            {d.today.map((b) => (
              <li key={b.id}><Link href={`/admin/bookings/${b.id}`} className="flex justify-between py-1.5">
                <span>{formatBangkok(b.pickup_at)} · {b.driver ?? "ยังไม่มีคนขับ"}</span><Badge>{b.status}</Badge></Link></li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Box title="งานรอจ่ายให้คนขับ" n={d.dispatch.length} href="/admin/bookings?f=active">
          <ul className="space-y-1">{d.dispatch.map((b) => (
            <li key={b.id}><Link className="text-navy hover:underline" href={`/admin/bookings/${b.id}`}>
              {formatBangkok(b.pickup_at)} · {b.offered_to ? `รอ ${b.offered_to} ตอบ` : <span className="text-bad">ไม่มีคนรับ</span>}</Link></li>))}</ul>
        </Box>
        <Box title="รอมัดจำ" n={d.deposit.length} href="/admin/bookings?f=awaiting_deposit">
          <ul className="space-y-1">{d.deposit.map((b) => (
            <li key={b.id}><Link className="text-navy hover:underline" href={`/admin/bookings/${b.id}`}>{formatBangkok(b.pickup_at)} · {formatBaht(b.deposit_satang)}</Link></li>))}</ul>
        </Box>
        <Box title="ส่วนลดรออนุมัติ" n={d.discounts.length} href="/admin/quotes?f=pending_approval">
          <ul className="space-y-1">{d.discounts.map((q) => (
            <li key={q.id}><Link className="text-navy hover:underline" href={`/admin/quotes/${q.id}`}>{q.number} r{q.revision} · ลด {formatBaht(q.discount_satang)}</Link></li>))}</ul>
        </Box>
        <Box title="สลิปรอยืนยัน" n={d.slips.length} href="/admin/bookings">
          <ul className="space-y-1">{d.slips.map((p, i) => (
            <li key={i}><Link className="text-navy hover:underline" href={`/admin/bookings/${p.booking_id}`}>{formatBaht(p.amount_satang)} · {p.reason}</Link></li>))}</ul>
        </Box>
        {isOwner && (
          <Box title="ต้องโอนคืนลูกค้า" n={d.refunds.length} href="/admin/bookings">
            <ul className="space-y-1">{d.refunds.map((p, i) => (
              <li key={i}><Link className="text-navy hover:underline" href={`/admin/bookings/${p.booking_id}`}>{formatBaht(p.amount_satang)}</Link></li>))}</ul>
          </Box>
        )}
        <Box title="payout รอโอน" n={d.payouts.length} href="/admin/payouts">
          <ul className="space-y-1">{d.payouts.map((p) => (
            <li key={p.id}><Link className="text-navy hover:underline" href="/admin/payouts">{p.display_name} · {formatBaht(p.net_satang)}</Link></li>))}</ul>
        </Box>
        <Box title="เอกสารใกล้หมด (30 วัน) / รอตรวจ" n={d.expiring + (isOwner ? d.pendingDocs : 0)} href={isOwner ? "/admin/documents" : "/admin/drivers"}>
          <p>ใกล้หมด {d.expiring}{isOwner && ` · รอตรวจ ${d.pendingDocs}`}</p>
        </Box>
        <Box title="เหตุการณ์ / ร้องเรียนเปิดอยู่" n={d.incidents.length + d.complaints.length} href="/admin/bookings">
          <ul className="space-y-1">
            {d.incidents.map((i, k) => <li key={`i${k}`}><Link className="text-navy hover:underline" href={`/admin/bookings/${i.booking_id}`}>{i.type} · {formatBangkok(i.opened_at)}</Link></li>)}
            {d.complaints.map((c, k) => <li key={`c${k}`}><Link className="text-bad hover:underline" href={`/admin/bookings/${c.booking_id}`}>ร้องเรียน: {String(c.description).slice(0, 60)}</Link></li>)}
          </ul>
        </Box>
      </div>
    </div>
  );
}
