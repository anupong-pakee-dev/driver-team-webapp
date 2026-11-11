import Link from "next/link";
import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { bangkokParts, formatBangkok } from "@/lib/time";
import { BOOKING_STATUS_TH, SLIP_REASON_TH } from "@/services/bookingView";
import { Badge, Empty, btnDark } from "@/components/ui";

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

  // 2a: รายการที่ต้องจัดการเรียงตามความเร่งด่วน · กล่องที่ว่างรวมเป็นบรรทัดเดียวด้านล่าง
  const tint = { bad: "bg-[#fbeeea] text-[#9a3a26]", warn: "bg-[#f6ecd9] text-[#7a5718]", ok: "bg-sage-soft text-sage" } as const;
  const link = "text-ink hover:underline";
  const actions: { title: string; n: number; href: string; cta: string; tone: keyof typeof tint; body: React.ReactNode }[] = [
    { title: "งานรอจ่ายให้คนขับ", n: d.dispatch.length, href: "/admin/bookings?f=active", cta: "มอบหมาย", tone: "bad", body: d.dispatch.map((b) => (
      <li key={b.id}><Link className={link} href={`/admin/bookings/${b.id}`}>
        {formatBangkok(b.pickup_at)} · {b.offered_to ? `รอ ${b.offered_to} ตอบ` : <span className="font-semibold text-bad">ไม่มีคนรับ</span>}</Link></li>)) },
    { title: "เหตุการณ์ / ร้องเรียนเปิดอยู่", n: d.incidents.length + d.complaints.length, href: "/admin/bookings", cta: "ดู", tone: "bad", body: <>
      {d.incidents.map((i, k) => <li key={`i${k}`}><Link className={link} href={`/admin/bookings/${i.booking_id}`}>{i.type} · {formatBangkok(i.opened_at)}</Link></li>)}
      {d.complaints.map((c, k) => <li key={`c${k}`}><Link className="text-bad hover:underline" href={`/admin/bookings/${c.booking_id}`}>ร้องเรียน: {String(c.description).slice(0, 60)}</Link></li>)}
    </> },
    { title: "สลิปรอยืนยัน", n: d.slips.length, href: "/admin/bookings", cta: "ตรวจ", tone: "warn", body: d.slips.map((p, i) => (
      <li key={i}><Link className={link} href={`/admin/bookings/${p.booking_id}`}>{formatBaht(p.amount_satang)} · {SLIP_REASON_TH[p.reason ?? ""] ?? p.reason}</Link></li>)) },
    { title: "รอมัดจำ", n: d.deposit.length, href: "/admin/bookings?f=awaiting_deposit", cta: "ดู", tone: "warn", body: d.deposit.map((b) => (
      <li key={b.id}><Link className={link} href={`/admin/bookings/${b.id}`}>{formatBangkok(b.pickup_at)} · {formatBaht(b.deposit_satang)}</Link></li>)) },
    { title: "ส่วนลดรออนุมัติ", n: d.discounts.length, href: "/admin/quotes?f=pending_approval", cta: "อนุมัติ", tone: "warn", body: d.discounts.map((q) => (
      <li key={q.id}><Link className={link} href={`/admin/quotes/${q.id}`}>{q.number} r{q.revision} · ลด {formatBaht(q.discount_satang)}</Link></li>)) },
    ...(isOwner ? [{ title: "ต้องโอนคืนลูกค้า", n: d.refunds.length, href: "/admin/bookings", cta: "โอน", tone: "warn" as const, body: d.refunds.map((p, i) => (
      <li key={i}><Link className={link} href={`/admin/bookings/${p.booking_id}`}>{formatBaht(p.amount_satang)}</Link></li>)) }] : []),
    { title: "payout รอโอน", n: d.payouts.length, href: "/admin/payouts", cta: "โอน", tone: "ok", body: d.payouts.map((p) => (
      <li key={p.id}><Link className={link} href="/admin/payouts">{p.display_name} · {formatBaht(p.net_satang)}</Link></li>)) },
    { title: "เอกสารใกล้หมด (30 วัน) / รอตรวจ", n: d.expiring + (isOwner ? d.pendingDocs : 0), href: isOwner ? "/admin/documents" : "/admin/drivers", cta: "ตรวจ", tone: "ok",
      body: <li>ใกล้หมด {d.expiring}{isOwner && ` · รอตรวจ ${d.pendingDocs}`}</li> },
  ];
  const todo = actions.filter((a) => a.n > 0);
  const clear = actions.filter((a) => a.n === 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] text-muted">{new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "full" }).format(new Date())}</p>
          <h1 className="mt-0.5 text-[1.75rem] font-bold">กล่องงานวันนี้</h1>
        </div>
        <Link href="/admin/quotes/new" className={`${btnDark} h-[42px] rounded-[0.875rem] px-4 py-0 text-sm`}>+ ออกใบเสนอราคา</Link>
      </div>

      {setup.some((s) => !s.ok) && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[0.875rem] bg-[#f6ecd9] px-4 py-3 text-sm text-[#7a5718]">
          <b>ยังต้องตั้งค่าก่อนเปิดรับงานจริง</b>
          {setup.filter((s) => !s.ok).map((s) => <Link key={s.label} href={s.href} className="underline">{s.label}</Link>)}
        </div>
      )}
      {d.dead > 0 && <p className="rounded-[0.875rem] bg-bad/10 px-4 py-3 text-sm text-bad">ข้อความแจ้งเตือนส่งไม่สำเร็จ {d.dead} รายการ — โทรแจ้งแทน (§14)</p>}

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="todo-h" className="space-y-2.5">
          <h2 id="todo-h" className="text-[0.9375rem] font-bold">ต้องจัดการ <span className="font-medium text-muted">· เรียงตามความเร่งด่วน</span></h2>
          {todo.length === 0 && <Empty>ไม่มีงานค้าง</Empty>}
          {todo.map((a) => (
            <div key={a.title} className="flex items-start gap-3.5 rounded-2xl border border-line bg-card px-3.5 py-3">
              <span className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[0.625rem] text-[0.9375rem] font-bold ${tint[a.tone]}`}>{a.n}</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[0.9375rem] font-semibold">{a.title}</h3>
                <ul className="mt-0.5 space-y-0.5 text-[0.8125rem] text-muted">{a.body}</ul>
              </div>
              <Link href={a.href} className="shrink-0 self-center text-[0.8125rem] font-semibold text-sage hover:underline">{a.cta} →</Link>
            </div>
          ))}
          {clear.length > 0 && <p className="px-0.5 py-1 text-[0.8125rem] text-muted">ไม่มีรายการ: {clear.map((a) => a.title).join(" · ")}</p>}
        </section>

        <section aria-labelledby="today-h" className="self-start rounded-[1.25rem] border border-line bg-card p-[1.125rem]">
          <div className="flex justify-between">
            <h2 id="today-h" className="text-[0.9375rem] font-bold">งานวันนี้</h2>
            <span className="text-[0.8125rem] text-muted">{d.today.length} งาน</span>
          </div>
          {d.today.length === 0 ? <p className="mt-3 text-sm text-muted">ไม่มีงานวันนี้</p> : (
            <ul className="mt-3">
              {d.today.map((b) => {
                const st = BOOKING_STATUS_TH[b.status] ?? [b.status, "info"];
                return (
                  <li key={b.id} className="border-t border-[#eee8dc]">
                    <Link href={`/admin/bookings/${b.id}`} className="flex items-center gap-3.5 py-3">
                      <span className="w-[52px] shrink-0 font-mono text-[0.9375rem] font-semibold">{bangkokParts(b.pickup_at).time}</span>
                      <span className={"min-w-0 flex-1 text-sm font-semibold " + (b.driver ? "" : "text-muted")}>{b.driver ?? "ยังไม่มีคนขับ"}</span>
                      <Badge tone={st[1]}>{st[0]}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
