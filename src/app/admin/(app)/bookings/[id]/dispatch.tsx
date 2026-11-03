import { asUser, pool } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { formatBangkok } from "@/lib/time";
import { rankedCandidates } from "@/services/dispatch";
import { Badge, Empty, Panel } from "@/components/ui";
import { NoShowConfirm, OverrideAssign, Redispatch, ResolveDispute } from "./dispatch-actions";

const RESULT_TH: Record<string, [string, "ok" | "warn" | "bad" | "info"]> = {
  pending: ["รอตอบ", "warn"], accepted: ["รับ", "ok"], rejected: ["ปฏิเสธ", "bad"], expired: ["หมดเวลา", "bad"], withdrawn: ["ถอน", "info"],
};
const CHECKIN_TH: Record<string, string> = { depart: "ออกเดินทาง", arrive: "ถึงจุดรับ", pickup: "รับแล้ว", dropoff: "ส่งแล้ว" };
const INCIDENT_TH: Record<string, string> = { accident: "อุบัติเหตุ", breakdown: "รถเสีย", no_show: "ลูกค้าไม่มา", lost_item: "ของหาย", safety: "ความปลอดภัย", other: "อื่นๆ" };

// FR-DISP-01..03/06 + FR-TRIP-02/04/05 ฝั่งหลังบ้าน
export async function DispatchPanel({ user, bookingId, status }: { user: SessionUser; bookingId: string; status: string }) {
  const isOwner = user.role === "owner";
  const d = await asUser(user.authUserId, async (db) => ({
    offers: (await db.query(
      `select o.id, o.result, o.offered_at, o.expires_at, o.reject_reason, o.is_override, o.override_reason, u.display_name, v.plate
         from job_offers o join users u on u.id = o.driver_id left join vehicles v on v.id = o.vehicle_id
        where o.booking_id = $1 order by o.offered_at`, [bookingId])).rows,
    assigned: (await db.query(
      `select u.display_name as driver, v.plate, bu.display_name as backup
         from bookings b left join users u on u.id = b.driver_id left join vehicles v on v.id = b.vehicle_id
         left join users bu on bu.id = b.backup_driver_id where b.id = $1`, [bookingId])).rows[0],
    checkins: (await db.query(
      `select id, kind, at, distance_from_target_m, accuracy_m, photo_path is not null as has_photo from checkins where booking_id = $1 order by at`, [bookingId])).rows,
    incidents: (await db.query(
      `select i.id, i.type, i.description, i.actions, i.status, i.opened_at, i.photo_path is not null as has_photo, u.display_name as by
         from incidents i join users u on u.id = i.reported_by where i.booking_id = $1 order by i.opened_at`, [bookingId])).rows,
    complaints: (await db.query(`select id, description, status, resolution, opened_at from complaints where booking_id = $1 order by opened_at`, [bookingId])).rows,
    review: (await db.query(`select rating, comment from reviews where booking_id = $1`, [bookingId])).rows[0],
  }));
  // ตัวเลือก override: เฉพาะคนที่ผ่านเกณฑ์ ณ วันงานและว่าง (BR-COMP-03) — รวมคนที่เคยได้ข้อเสนอแล้วด้วย
  const candidates = isOwner && ["confirmed", "assigned"].includes(status)
    ? await (async () => {
        const c = await rankedCandidates(pool, bookingId, true);
        const { rows } = await pool.query(
          `select u.id, u.display_name, v.id as vid, v.plate from users u left join vehicles v on v.driver_id = u.id where u.id = any($1)`,
          [c.map((x) => x.driverId)]);
        return c.map((x) => {
          const n = rows.find((r) => r.id === x.driverId && (x.vehicleId ? r.vid === x.vehicleId : true));
          return { driverId: x.driverId, vehicleId: x.vehicleId, label: `${n?.display_name}${n?.plate && x.vehicleId ? ` · ${n.plate}` : ""}` };
        });
      })()
    : [];
  const pendingOffer = d.offers.find((o) => o.result === "pending");
  const noShowReported = d.incidents.some((i) => i.type === "no_show" && i.status === "open");

  return (
    <>
      <Panel title="คนขับ">
        {d.assigned?.driver ? (
          <p className="text-sm"><b>{d.assigned.driver}</b>{d.assigned.plate && ` · ${d.assigned.plate}`}
            {d.assigned.backup && <span className="block text-xs text-muted">คนสำรอง: {d.assigned.backup}</span>}</p>
        ) : pendingOffer ? (
          <p className="text-sm">รอ <b>{pendingOffer.display_name}</b> ตอบ (ถึง {formatBangkok(pendingOffer.expires_at)})</p>
        ) : status === "confirmed" ? (
          <p className="text-sm text-warn">ยังไม่มีคนรับงาน</p>
        ) : <p className="text-sm text-muted">—</p>}
        {status === "confirmed" && !pendingOffer && <div className="mt-2"><Redispatch bookingId={bookingId} /></div>}
        {isOwner && candidates.length > 0 && (
          <div className="mt-3 border-t border-line pt-3"><OverrideAssign bookingId={bookingId} candidates={candidates} /></div>
        )}
        {isOwner && ["confirmed", "assigned"].includes(status) && candidates.length === 0 && (
          <p className="mt-2 text-xs text-muted">ไม่มีคนขับที่ผ่านเกณฑ์และว่าง ณ วันงาน</p>
        )}
      </Panel>

      <Panel title="ประวัติการเสนองาน">
        {d.offers.length === 0 ? <Empty>ยังไม่ได้เสนอ</Empty> : (
          <ul className="space-y-1.5 text-sm">
            {d.offers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={RESULT_TH[o.result][1]}>{RESULT_TH[o.result][0]}</Badge>
                <span>{o.display_name}{o.plate && ` · ${o.plate}`}</span>
                <span className="text-xs text-muted">{formatBangkok(o.offered_at)}</span>
                {o.is_override && <span className="text-xs text-warn">override: {o.override_reason}</span>}
                {o.reject_reason && <span className="text-xs text-muted">({o.reject_reason})</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {d.checkins.length > 0 && (
        <Panel title="Check-in">
          <ul className="space-y-1.5 text-sm">
            {d.checkins.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <span className="w-20 font-medium">{CHECKIN_TH[c.kind]}</span>
                <span className="text-muted">{formatBangkok(c.at)}</span>
                {c.distance_from_target_m != null && (
                  <Badge tone={c.distance_from_target_m > 500 ? "warn" : "ok"}>ห่างจุดนัด {c.distance_from_target_m} ม.</Badge>
                )}
                {c.has_photo && <a className="text-navy underline" target="_blank" rel="noreferrer" href={`/api/admin/files?checkin=${c.id}`}>รูป ↗</a>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {(d.incidents.length > 0 || noShowReported) && (
        <Panel title="เหตุการณ์">
          <ul className="space-y-2 text-sm">
            {d.incidents.map((i) => (
              <li key={i.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={i.status === "open" ? "warn" : "ok"}>{INCIDENT_TH[i.type]}</Badge>
                  <span className="text-xs text-muted">{i.by} · {formatBangkok(i.opened_at)}</span>
                  {i.has_photo && <a className="text-navy underline" target="_blank" rel="noreferrer" href={`/api/admin/files?incident=${i.id}`}>รูป ↗</a>}
                </div>
                <p>{i.description}</p>
                {i.actions && <p className="text-xs text-muted">ทำแล้ว: {i.actions}</p>}
              </li>
            ))}
          </ul>
          {isOwner && status === "arrived" && noShowReported && <div className="mt-3"><NoShowConfirm bookingId={bookingId} /></div>}
        </Panel>
      )}

      {(d.complaints.length > 0 || d.review) && (
        <Panel title="รีวิว / ร้องเรียน">
          {d.review && <p className="text-sm">{"★".repeat(d.review.rating)}{"☆".repeat(5 - d.review.rating)} {d.review.comment}</p>}
          {d.complaints.map((c) => (
            <div key={c.id} className="mt-2 text-sm">
              <Badge tone={c.status === "open" ? "bad" : "ok"}>{c.status === "open" ? "ร้องเรียน (เปิด)" : "ปิดแล้ว"}</Badge> {c.description}
              {c.resolution && <p className="text-xs text-muted">ผล: {c.resolution}</p>}
            </div>
          ))}
          {isOwner && status === "disputed" && <div className="mt-3"><ResolveDispute bookingId={bookingId} /></div>}
        </Panel>
      )}
    </>
  );
}

