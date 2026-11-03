import "server-only";
import { pickClickId, platformFromParams, resolveSource, type AdPlatform } from "@/domain/attribution";
import type { SessionUser } from "@/lib/auth";
import { pool, withTx, type Db } from "@/lib/db";
import { BizError } from "@/lib/errors";
import { getSettings } from "@/lib/settings";

// §7.7 Attribution · FR-ADS-01..04/10/17

export type TouchInput = {
  anon_id: string | null;           // มีเมื่อยินยอม (FR-ADS-10)
  consented: boolean;
  campaign_slug?: string | null;
  service_type?: string | null;
  utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null; utm_content?: string | null;
  gclid?: string | null; fbclid?: string | null; ttclid?: string | null;
  landing_url?: string | null;
};

/** บันทึกการเข้าเว็บจากแคมเปญ/โฆษณา — ไม่ยินยอม: นับเฉพาะแคมเปญ ไม่ผูกคน ไม่เก็บ click id */
export async function recordTouchpoint(t: TouchInput) {
  const { rows: c } = t.campaign_slug
    ? await pool.query(`select id from campaigns where slug = $1`, [t.campaign_slug])
    : { rows: [] as { id: string }[] };
  const click = t.consented ? pickClickId(t) : null;
  const { rows } = await pool.query(
    `insert into touchpoints (anon_id, consented, campaign_id, service_type, utm_source, utm_medium, utm_campaign, utm_content,
                              click_id_type, click_id, landing_url)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [t.consented && t.anon_id ? t.anon_id : "no-consent", t.consented, c[0]?.id ?? null, t.service_type ?? null,
     t.utm_source ?? null, t.utm_medium ?? null, t.utm_campaign ?? null, t.utm_content ?? null,
     click?.type ?? null, click?.id ?? null, t.landing_url?.slice(0, 500) ?? null]);
  return rows[0].id as string;
}

/** §7.7 ข้อ 3: login LIFF สำเร็จ → ผูก touchpoint (และทุก touchpoint ของ anon_id เดียวกัน) กับ user */
export async function claimTouchpoint(user: SessionUser, touchpointId: string, anonId: string | null) {
  return withTx({ userId: user.id, role: user.role, reason: "claim touchpoint" }, async (db) => {
    const { rows } = await db.query(`select anon_id, consented, user_id from touchpoints where id = $1`, [touchpointId]);
    const t = rows[0];
    if (!t) throw new BizError("NOT_FOUND");
    if (!t.consented) return { claimed: 0 };
    const { rowCount } = await db.query(
      `update touchpoints set user_id = $2
        where user_id is null and consented and (id = $1 or ($3::text is not null and anon_id = $3))`,
      [touchpointId, user.id, anonId ?? t.anon_id]);
    return { claimed: rowCount };
  });
}

/** §7.7 ข้อ 4: first = touchpoint แรกของ user ใน N วัน · last = ล่าสุด */
export async function touchesFor(db: Pick<Db, "query">, userId: string) {
  const days = Number((await getSettings()).attribution_days ?? 30);
  const { rows } = await db.query(
    `select (select id from touchpoints where user_id = $1 and at > now() - make_interval(days => $2) order by at asc limit 1) as first,
            (select id from touchpoints where user_id = $1 and at > now() - make_interval(days => $2) order by at desc limit 1) as last`,
    [userId, days]);
  return { first: rows[0].first as string | null, last: rows[0].last as string | null };
}

/** §7.7 ข้อ 5: แหล่งที่มาของ booking — ไม่มีค่าว่าง */
export async function bookingSource(db: Pick<Db, "query">, lastTouchId: string | null, sourceAnswer: string | null) {
  let campaignPlatform: AdPlatform | null = null;
  let paramsPlatform: AdPlatform | null = null;
  let campaignId: string | null = null;
  if (lastTouchId) {
    const { rows } = await db.query(
      `select t.campaign_id, c.platform, t.utm_source, t.click_id_type, t.click_id
         from touchpoints t left join campaigns c on c.id = t.campaign_id where t.id = $1`, [lastTouchId]);
    const t = rows[0];
    if (t) {
      campaignId = t.campaign_id;
      campaignPlatform = t.platform ?? null;
      paramsPlatform = platformFromParams({ utm_source: t.utm_source, [t.click_id_type ?? "x"]: t.click_id });
    }
  }
  return { platform: resolveSource({ touchCampaignPlatform: campaignPlatform, touchParamsPlatform: paramsPlatform, sourceAnswer }), campaignId };
}

/** FR-ADS-05 (ขั้นต้น): ต่อแคมเปญ/แพลตฟอร์ม ในช่วงวันที่ */
export async function adReport(db: Pick<Db, "query">, from: string, to: string) {
  const { rows } = await db.query(
    `with spend as (
       select platform, campaign_id, sum(amount_satang)::bigint as spend from ad_spend where date between $1 and $2 group by 1, 2),
     touches as (
       select c.platform, t.campaign_id, count(*)::int as clicks from touchpoints t left join campaigns c on c.id = t.campaign_id
        where t.at::date between $1 and $2 and t.campaign_id is not null group by 1, 2),
     bk as (
       select b.source_platform as platform, b.campaign_id,
              count(*) filter (where b.status <> 'expired')::int as booked,
              count(*) filter (where b.status = 'completed')::int as completed,
              coalesce(sum(b.price_satang) filter (where b.status = 'completed'), 0)::bigint as revenue
         from bookings b where b.created_at::date between $1 and $2 group by 1, 2),
     qt as (
       select coalesce(c.platform, 'unknown') as platform, t.campaign_id, count(*)::int as quotes
         from quotes q left join touchpoints t on t.id = q.last_touch_id left join campaigns c on c.id = t.campaign_id
        where q.revision = 1 and q.created_at::date between $1 and $2 group by 1, 2),
     keys as (select platform::text, campaign_id from spend union select platform::text, campaign_id from touches
              union select platform::text, campaign_id from bk union select platform::text, campaign_id from qt)
     select k.platform, k.campaign_id, c.name as campaign, c.slug,
            coalesce(s.spend, 0)::bigint as spend, coalesce(t.clicks, 0) as clicks, coalesce(q.quotes, 0) as quotes,
            coalesce(b.booked, 0) as booked, coalesce(b.completed, 0) as completed, coalesce(b.revenue, 0)::bigint as revenue
       from keys k left join campaigns c on c.id = k.campaign_id
       left join spend s on s.platform::text = k.platform and s.campaign_id is not distinct from k.campaign_id
       left join touches t on t.platform::text = k.platform and t.campaign_id is not distinct from k.campaign_id
       left join qt q on q.platform::text = k.platform and q.campaign_id is not distinct from k.campaign_id
       left join bk b on b.platform::text = k.platform and b.campaign_id is not distinct from k.campaign_id
      order by spend desc, completed desc`,
    [from, to]);
  return rows.map((r) => ({
    ...r,
    spend: Number(r.spend), revenue: Number(r.revenue),
    cost_per_quote: r.quotes ? Math.round(Number(r.spend) / r.quotes) : null,
    cost_per_completed: r.completed ? Math.round(Number(r.spend) / r.completed) : null,
    pct_of_revenue: Number(r.revenue) ? Number(r.spend) / Number(r.revenue) : null,
    roas: Number(r.spend) ? Number(r.revenue) / Number(r.spend) : null,
  }));
}
