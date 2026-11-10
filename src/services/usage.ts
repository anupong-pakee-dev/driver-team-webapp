import "server-only";
import { messageQuota } from "@/adapters/line/messaging";
import { pool } from "@/lib/db";
import { log } from "@/lib/redact";
import { getSetting } from "@/lib/settings";
import { bangkokToday } from "./compliance";

// หน้าภาพรวมการใช้งาน (เจ้าของ/แอดมิน): โควตาบริการภายนอก · ผู้เข้าชม · ตัวเลขธุรกิจเดือนนี้ · คนขับ · ระบบ
// อ่านด้วยสิทธิ์เซิร์ฟเวอร์หลังตรวจว่าเป็น staff แล้ว (ขนาดฐานข้อมูล/ไฟล์ต้องอ่านจาก schema ระบบ)

export type PlanLimits = { db_mb?: number | null; storage_mb?: number | null; line_messages?: number | null; note?: string };
type LineQuota = { limit: number | null; used: number } | { error: string };

// โควตา LINE เปลี่ยนช้าและ API มีเพดานเรียก → cache 5 นาทีต่อ process
let lineCache: { at: number; value: LineQuota } | null = null;
async function lineQuota(): Promise<LineQuota> {
  if (lineCache && Date.now() - lineCache.at < 5 * 60_000) return lineCache.value;
  let value: LineQuota;
  try {
    value = await messageQuota();
  } catch (e) {
    const msg = (e as Error).message;
    value = { error: msg.includes("not set") ? "ยังไม่ได้เชื่อมต่อ LINE (ไม่มี LINE_CHANNEL_ACCESS_TOKEN)" : "อ่านโควตาจาก LINE ไม่ได้ชั่วคราว" };
    if (!msg.includes("not set")) log.warn("line quota failed", { error: msg });
  }
  lineCache = { at: Date.now(), value };
  return value;
}

const MONTH_START = `(date_trunc('month', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')`;

export async function loadUsage() {
  const today = bangkokToday();
  const [line, limits, sizes, visits, daily, pages, refs, langs, biz, drivers, outbox] = await Promise.all([
    lineQuota(),
    getSetting<PlanLimits>("plan_limits"),
    pool.query(`select pg_database_size(current_database())::bigint as db,
                       coalesce((select sum((metadata->>'size')::bigint) from storage.objects), 0)::bigint as storage,
                       (select count(*) from storage.objects)::int as files`),
    pool.query(`select
        count(distinct visitor) filter (where day = $1::date)::int as today_visitors,
        count(*) filter (where day = $1::date)::int as today_views,
        count(distinct (day, visitor)) filter (where day > $1::date - 7)::int as week_visitors,
        count(*) filter (where day > $1::date - 7)::int as week_views,
        count(distinct (day, visitor))::int as month_visitors,
        count(*)::int as month_views
      from page_views where day > $1::date - 30`, [today]),
    pool.query(`select d::date::text as day, coalesce(v.visitors, 0)::int as visitors, coalesce(v.views, 0)::int as views
                  from generate_series($1::date - 29, $1::date, interval '1 day') d
                  left join (select day, count(distinct visitor) as visitors, count(*) as views from page_views
                              where day > $1::date - 30 group by day) v on v.day = d::date
                 order by d`, [today]),
    pool.query(`select path, count(*)::int as views, count(distinct (day, visitor))::int as visitors
                  from page_views where day > $1::date - 30 group by path order by views desc limit 8`, [today]),
    pool.query(`select coalesce(referrer, '(เข้าตรง / ในแอป LINE)') as source, count(distinct (day, visitor))::int as visitors
                  from page_views where day > $1::date - 30 group by 1 order by 2 desc limit 6`, [today]),
    pool.query(`select coalesce(locale, 'auto') as locale, count(distinct (day, visitor))::int as visitors
                  from page_views where day > $1::date - 30 group by 1 order by 2 desc`, [today]),
    pool.query(`select
        (select count(*) from quotes where created_at >= ${MONTH_START} and revision = 1)::int as quotes,
        (select count(*) from bookings where created_at >= ${MONTH_START})::int as bookings,
        (select count(*) from bookings where created_at >= ${MONTH_START} and status not in ('awaiting_deposit','expired'))::int as paid_bookings,
        (select count(*) from bookings where created_at >= ${MONTH_START} and status = 'cancelled')::int as cancelled,
        (select count(*) from bookings where status = 'completed' and pickup_at >= ${MONTH_START})::int as completed,
        (select count(*) from bookings where status in ('confirmed','assigned') and pickup_at > now())::int as upcoming,
        (select count(*) from bookings where status = 'confirmed')::int as waiting_driver,
        coalesce((select sum(amount_satang) from payments where status = 'verified' and kind in ('deposit','balance','wait_fee') and created_at >= ${MONTH_START}), 0)::bigint as received,
        coalesce((select sum(amount_satang) from payments where status = 'refunded' and kind = 'refund' and created_at >= ${MONTH_START}), 0)::bigint as refunded,
        (select count(*) from users where role in ('customer','corporate_customer') and created_at >= ${MONTH_START})::int as new_customers,
        (select count(*) from users where role in ('customer','corporate_customer') and status = 'active')::int as customers`),
    pool.query(`select
        (select count(*) from drivers d join users u on u.id = d.user_id
          where u.status = 'active' and d.kyc_status = 'approved'
            and exists (select 1 from vehicles v where v.driver_id = d.user_id and v.kyc_status = 'approved' and v.active))::int as ready,
        (select count(*) from drivers d join users u on u.id = d.user_id where u.status = 'active')::int as total,
        (select count(*) from drivers d join users u on u.id = d.user_id where u.status = 'active' and d.kyc_status <> 'approved')::int as not_ready,
        (select count(*) from documents where status = 'pending')::int as docs_pending,
        (select count(*) from documents where status = 'approved' and expires_at between current_date and current_date + 30)::int as docs_expiring`),
    pool.query(`select
        count(*) filter (where topic = 'line.push' and status = 'sent')::int as sent,
        count(*) filter (where topic = 'line.push' and status in ('pending','failed'))::int as waiting,
        count(*) filter (where topic = 'line.push' and status = 'dead')::int as dead
      from outbox where created_at >= ${MONTH_START}`),
  ]);

  const now = new Date(`${today}T12:00:00+07:00`);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return {
    today, dayOfMonth: Number(today.slice(8, 10)), daysInMonth,
    line, limits: limits ?? {},
    sizes: { db: Number(sizes.rows[0].db), storage: Number(sizes.rows[0].storage), files: sizes.rows[0].files as number },
    visits: visits.rows[0] as Record<string, number>,
    daily: daily.rows as { day: string; visitors: number; views: number }[],
    pages: pages.rows as { path: string; views: number; visitors: number }[],
    refs: refs.rows as { source: string; visitors: number }[],
    langs: langs.rows as { locale: string; visitors: number }[],
    biz: Object.fromEntries(Object.entries(biz.rows[0]).map(([k, v]) => [k, Number(v)])) as Record<string, number>,
    drivers: drivers.rows[0] as Record<string, number>,
    outbox: outbox.rows[0] as Record<string, number>,
  };
}
