-- เฟส 3 (S3) ราคา/ใบเสนอราคา: FR-CAT-01, FR-BOOK-01/02, FR-PRICE-01/02, FR-QUOTE-01/02/04

-- FR-BOOK-01 หมายเหตุ · งานเหมา: จำนวนชั่วโมง · ส่วนลดรออนุมัติ: ใครขอ
alter table quotes add column notes text check (length(notes) <= 1000);
alter table quotes add column hours int check (hours between 1 and 24);
alter table quotes add column discount_requested_by uuid references users(id);
alter table quotes add column reminded_at timestamptz;              -- เตือน 2 ชม. ก่อนหมด (FR-QUOTE-04)

-- §7.1 cache ระยะทาง 7 วัน ⚙️ ด้วย key = hash(place_ids) (ตารางเทคนิค)
create table route_cache (
  key        text primary key,
  distance_m int not null,
  duration_s int not null,
  created_at timestamptz not null default now()
);
alter table route_cache enable row level security;
revoke all on route_cache from anon, authenticated;

-- FR-PRICE-02: แก้ราคา = ปิดกฎเดิม (active_to) แล้วเพิ่มกฎใหม่ → ใบเสนอราคาเดิมยังชี้กฎเดิม
-- กันกฎ active ซ้อนกันต่อ (car_type, service_type)
alter table price_rules add constraint price_rules_no_overlap
  exclude using gist (car_type with =, service_type with =,
                      tstzrange(active_from, coalesce(active_to, 'infinity'), '[)') with &&);

-- quote ที่ส่งแล้ว: ราคา/ส่วนลดแก้ทับไม่ได้ ต้องออก revision ใหม่ (BR-QUOTE-03)
create or replace function quotes_immutable_price() returns trigger language plpgsql as $$
begin
  if old.status in ('sent','accepted','expired','superseded','rejected')
     and (new.computed_satang, new.discount_satang, new.final_satang, new.number, new.revision)
         is distinct from (old.computed_satang, old.discount_satang, old.final_satang, old.number, old.revision) then
    raise exception 'QUOTE_PRICE_IMMUTABLE' using errcode = 'DT409';
  end if;
  return new;
end $$;
create trigger quotes_10_immutable_price before update on quotes
  for each row execute function quotes_immutable_price();

-- FR-CAT-01: แสดงเฉพาะ (บริการ, ประเภทรถ) ที่มีรถ+คนขับ eligible ≥ 1 ณ วันที่ระบุ
-- driver_only: ดูเฉพาะคนขับ · ใช้ได้ทั้ง anon (หน้าแคตตาล็อก) — คืนแค่คู่ประเภท ไม่เปิดเผยตัวตน
create or replace function catalog_available(on_date date)
returns table (service_type service_type, car_type car_type)
language sql stable security definer set search_path = public as $$
  select s, v.car_type
    from vehicles v
    join drivers d on d.user_id = v.driver_id
   cross join unnest(enum_range(null::service_type)) s
   where s <> 'driver_only'
     and cardinality(vehicle_ineligible_reasons(v, s, on_date)) = 0
     and cardinality(driver_ineligible_reasons(d, v.car_type, on_date)) = 0
   group by s, v.car_type
  union
  -- คนขับอย่างเดียว (ขับรถลูกค้า) ขายได้ทุกบริการ ถ้ามีคนขับ eligible
  select s, 'driver_only'::car_type
    from unnest(enum_range(null::service_type)) s
   where exists (select 1 from drivers d where cardinality(driver_ineligible_reasons(d, 'driver_only', on_date)) = 0)
$$;
grant execute on function catalog_available(date) to anon, authenticated;
