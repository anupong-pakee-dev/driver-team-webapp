-- คนขับเปิด/ปิดรับงานเอง (แทนปฏิทินช่วงไม่ว่าง)
-- on = ได้รับข้อเสนองาน · off = ไม่ได้รับข้อเสนองานใหม่ (งานที่รับไว้แล้วยังอยู่)
-- ตาราง availability ยังอยู่ (driver_is_free ใช้ตรวจเวลาชนกับงานอื่น) แต่ไม่มีหน้าให้คนขับเพิ่มช่วงไม่ว่างแล้ว

alter table drivers add column accepting_jobs boolean not null default true;
grant select (accepting_jobs) on drivers to authenticated;

create or replace function dispatch_candidates(p_booking uuid, p_include_offered boolean default false)
returns table (driver_id uuid, vehicle_id uuid, last_assigned_at timestamptz, score int)
language sql stable as $$
  select d.user_id, v.id, d.last_assigned_at, d.score
    from bookings b
   cross join drivers d
    left join vehicles v on b.car_type <> 'driver_only' and v.driver_id = d.user_id and v.car_type = b.car_type and v.active
   where b.id = p_booking
     and d.accepting_jobs
     and (b.car_type = 'driver_only' or v.id is not null)
     and (p_include_offered or not exists (select 1 from job_offers o where o.booking_id = b.id and o.driver_id = d.user_id))
     and cardinality(assignment_problems(b.id, d.user_id, v.id)) = 0
$$;
