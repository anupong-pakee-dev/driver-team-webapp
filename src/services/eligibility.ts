import "server-only";
import type { Db } from "@/lib/db";

// FR-VEH-04: คำนวณสด ณ วันที่เลือก (ADR-09) — ใช้ฟังก์ชัน SQL §7.2 เป็นแหล่งความจริงเดียว
// (ผ่าน wrapper driver_reasons / vehicle_reasons เพราะ client role อ่านคอลัมน์ *_enc ไม่ได้)

export type VehicleEligibility = {
  id: string;
  plate: string;
  car_type: string;
  kyc_status: string;
  active: boolean;
  driver_id: string;
  driver_name: string | null;
  driver_reasons: string[];
  services: { service: string; reasons: string[] }[];
};

export async function vehicleEligibility(db: Db, onDate: string, filter: { driverId?: string } = {}) {
  const { rows } = await db.query<VehicleEligibility>(
    `select v.id, v.plate, v.car_type, v.kyc_status, v.active, v.driver_id, u.display_name as driver_name,
            driver_reasons(v.driver_id, v.car_type, $1::date) as driver_reasons,
            (select json_agg(json_build_object('service', s, 'reasons', vehicle_reasons(v.id, s, $1::date)) order by s)
               from unnest(enum_range(null::service_type)) s where s <> 'driver_only') as services
       from vehicles v
       join users u on u.id = v.driver_id
      where ($2::uuid is null or v.driver_id = $2)
      order by u.display_name, v.plate`,
    [onDate, filter.driverId ?? null],
  );
  return rows;
}

/** เหตุผลระดับคนขับ (ใช้กับงาน driver_only และสรุปหน้าคนขับ) */
export async function driverEligibility(db: Db, onDate: string, filter: { driverId?: string } = {}) {
  const { rows } = await db.query<{ user_id: string; reasons: string[] }>(
    `select d.user_id, driver_reasons(d.user_id, 'driver_only', $1::date) as reasons
       from drivers d where ($2::uuid is null or d.user_id = $2)`,
    [onDate, filter.driverId ?? null],
  );
  return new Map(rows.map((r) => [r.user_id, r.reasons]));
}
