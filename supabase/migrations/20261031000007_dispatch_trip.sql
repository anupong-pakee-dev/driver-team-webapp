-- เฟส 5 (S5) จ่ายงาน/วันงาน: FR-DISP-01..03/06, FR-TRIP-01..06, FR-FRAUD-01

-- FR-TRIP-05: แนบรูปกับเหตุการณ์ (เช่น ลูกค้าไม่มา) + ปิดเคส
alter table incidents add column photo_path text;
alter table incidents add column resolved_by uuid references users(id);
alter table incidents add column resolution text;
create trigger incidents_audit after insert or update on incidents for each row execute function audit_row();
create trigger complaints_audit after insert or update on complaints for each row execute function audit_row();
create trigger reviews_audit after insert on reviews for each row execute function audit_row();
create trigger checkins_audit after insert on checkins for each row execute function audit_row();

-- reviews: แก้ไม่ได้หลังส่ง (ลูกค้าให้คะแนนครั้งเดียว)
-- contact_reveals: append-only (หลักฐาน FR-FRAUD-01)
create or replace function append_only() returns trigger language plpgsql as $$
begin raise exception '% is append-only', tg_table_name using errcode = 'DT409'; end $$;
create trigger contact_reveals_append_only before update or delete on contact_reveals for each row execute function append_only();
create trigger checkins_append_only before update or delete on checkins for each row execute function append_only();

-- BR-DISP-01 / BR-COMP-03: ปัญหาที่ทำให้มอบงานนี้ให้คนขับ+รถคู่นี้ไม่ได้ (ว่าง = มอบได้) — ใช้ทั้งเสนองาน รับงาน และ override
create or replace function assignment_problems(p_booking uuid, p_driver uuid, p_vehicle uuid)
returns text[] language plpgsql stable as $$
declare
  b bookings; d drivers; v vehicles; on_date date; r text[]; buf int;
begin
  select * into b from bookings where id = p_booking;
  if b.id is null then return array['booking_not_found']; end if;
  select * into d from drivers where user_id = p_driver;
  if d.user_id is null then return array['driver_not_found']; end if;
  -- ตรวจ ณ วันงาน (BR-COMP-04)
  on_date := (b.pickup_at at time zone 'Asia/Bangkok')::date;
  r := driver_ineligible_reasons(d, b.car_type, on_date);
  if b.car_type <> 'driver_only' then
    select * into v from vehicles where id = p_vehicle;
    if v.id is null or v.driver_id <> p_driver or v.car_type <> b.car_type then
      r := r || 'vehicle_mismatch'::text;
    else
      r := r || vehicle_ineligible_reasons(v, b.service_type, on_date);
    end if;
  end if;
  buf := coalesce((select (value #>> '{}')::int from settings where key = 'buffer_minutes'), 60);
  if not driver_is_free(p_driver, b.pickup_at, b.est_end_at, buf, b.id) then
    r := r || 'time_conflict'::text;
  end if;
  return r;
end $$;

-- §7.3 ผู้มีสิทธิ์รับงาน (ลำดับคิวเวียนทำใน domain/dispatch.ts)
--   ค่าเริ่ม: ไม่รวมคนที่เคยได้ข้อเสนองานนี้แล้ว · p_include_offered = true สำหรับรายชื่อให้ owner เลือก (override)
create or replace function dispatch_candidates(p_booking uuid, p_include_offered boolean default false)
returns table (driver_id uuid, vehicle_id uuid, last_assigned_at timestamptz, score int)
language sql stable as $$
  select d.user_id, v.id, d.last_assigned_at, d.score
    from bookings b
   cross join drivers d
    left join vehicles v on b.car_type <> 'driver_only' and v.driver_id = d.user_id and v.car_type = b.car_type and v.active
   where b.id = p_booking
     and (b.car_type = 'driver_only' or v.id is not null)
     and (p_include_offered or not exists (select 1 from job_offers o where o.booking_id = b.id and o.driver_id = d.user_id))
     and cardinality(assignment_problems(b.id, d.user_id, v.id)) = 0
$$;
