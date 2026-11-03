-- เฟส 2 (S2) คนขับ/รถ: FR-DRV-01..05, FR-VEH-01..05, FR-DISP-04

-- ───────────── FR-DRV-01 ลิงก์เชิญ ใช้ได้ครั้งเดียว 72 ชม. (ตารางเทคนิค) ─────────────
create table driver_invites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id),       -- บัญชีคนขับที่สร้างรอไว้
  token_hash  text not null unique,                      -- sha256(token) — ไม่เก็บ token ดิบ
  created_by  uuid not null references users(id),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
alter table driver_invites enable row level security;
revoke all on driver_invites from anon;
revoke insert, update, delete, truncate, references, trigger on driver_invites from authenticated;
create policy invites_read on driver_invites for select using (app_role() = 'owner');
create trigger driver_invites_audit after insert or update or delete on driver_invites
  for each row execute function audit_row();

-- ───────────── ข้อมูลที่กรอกคู่กับเอกสาร ─────────────
-- คนขับส่ง "ข้อมูล + ไฟล์" → owner อนุมัติ → service คัดลอกเข้า drivers/vehicles
-- (คนขับแก้วันหมดอายุเองโดยตรงไม่ได้ ต้องผ่านการอนุมัติ)
alter table documents add column data     jsonb not null default '{}';  -- ค่าทั่วไป เช่น expiry, policy_no
alter table documents add column data_enc bytea;                         -- ค่าอ่อนไหว เช่น เลขใบขับขี่ เลขบัญชี
alter table documents add column uploaded_by uuid references users(id);
revoke select on documents from authenticated;
grant select (id, owner_type, owner_id, doc_type, file_path, status, expires_at, reviewed_by, reviewed_at,
              reject_reason, created_at, data, uploaded_by) on documents to authenticated;

-- FR-DRV-04 เก็บ IP / LINE ID ตอนยอมรับ
alter table consents add column meta jsonb not null default '{}';

-- ───────────── ประเภทเอกสารที่ต้องมี (⚙️ settings.compliance.required_docs) ─────────────
create or replace function required_doc_types(p_owner_type text) returns text[]
language sql stable as $$
  select coalesce(
    array(select jsonb_array_elements_text(value->'required_docs'->p_owner_type) from settings where key = 'compliance'),
    '{}')
$$;

-- เอกสารล่าสุดต่อประเภท
create or replace view latest_documents with (security_invoker = true) as
  select distinct on (owner_type, owner_id, doc_type)
         id, owner_type, owner_id, doc_type, status, expires_at, created_at
    from documents
   order by owner_type, owner_id, doc_type, created_at desc;
grant select on latest_documents to authenticated;

-- FR-DRV-03: kyc_status คำนวณใหม่ทันทีหลังอนุมัติ/อัปโหลด/หมดอายุ
--   approved ⇔ เอกสารที่ต้องมีทุกประเภทมีฉบับที่ approved อย่างน้อย 1 ฉบับ
--             (ส่งฉบับต่ออายุแล้วรอตรวจ ไม่ทำให้หลุด — วันหมดอายุตรวจแยกใน eligibility)
--   rejected ⇔ ประเภทที่ยังไม่มีฉบับ approved และฉบับล่าสุดถูกปฏิเสธ · นอกนั้น pending
create or replace function refresh_kyc(p_owner_type text, p_owner_id uuid) returns kyc_status
language plpgsql as $$
declare
  req text[] := required_doc_types(p_owner_type);
  missing text[];
  st kyc_status;
begin
  select coalesce(array_agg(t), '{}') into missing
    from unnest(req) t
   where not exists (select 1 from documents d
                      where d.owner_type = p_owner_type and d.owner_id = p_owner_id
                        and d.doc_type = t and d.status = 'approved');

  if cardinality(req) > 0 and cardinality(missing) = 0 then
    st := 'approved';
  elsif exists (select 1 from latest_documents
                 where owner_type = p_owner_type and owner_id = p_owner_id
                   and doc_type = any(missing) and status = 'rejected') then
    st := 'rejected';
  else
    st := 'pending';
  end if;

  if p_owner_type = 'driver' then
    update drivers set kyc_status = st where user_id = p_owner_id and kyc_status is distinct from st;
  else
    update vehicles set kyc_status = st where id = p_owner_id and kyc_status is distinct from st;
  end if;
  return st;
end $$;

-- ───────────── BR-COMP-02: ต้องมีทั้งสัญญาและ PDPA consent ฉบับล่าสุดที่ยังให้ความยินยอม ─────────────
-- security definer: ผล eligibility ต้องเหมือนกันไม่ว่าใครดู (sales_admin อ่าน consents ไม่ได้)
create or replace function has_consent(p_user uuid, p_kind consent_kind) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select granted from consents where user_id = p_user and kind = p_kind
                   order by at desc limit 1), false)
$$;

create or replace function driver_ineligible_reasons(d drivers, ct car_type, on_date date)
returns text[] language sql stable as $$
  select array_remove(array[
    case when d.kyc_status <> 'approved' then 'kyc_not_approved' end,
    case when coalesce(d.public_license_expiry, '-infinity'::date) < on_date then 'license_expired' end,
    case when ct <> 'driver_only' and not exists (
           select 1 from license_coverage lc
           where lc.license_class = d.public_license_class and lc.car_type = ct)
         then 'license_class_mismatch' end,
    case when d.background_check_passed is not true
           or d.background_check_at is null
           -- ยังไม่ตั้งอายุผลตรวจ (null) → ถือว่าไม่ผ่าน ต้องไม่ปล่อยผ่านโดยไม่ตั้งใจ
           or coalesce(d.background_check_at < on_date - make_interval(years =>
                (select (value->>'bg_check_valid_years')::int from settings where key = 'compliance')), true)
         then 'background_check' end,
    case when not has_consent(d.user_id, 'driver_contract') then 'no_contract' end,
    case when not has_consent(d.user_id, 'privacy') then 'no_privacy_consent' end,
    case when (select u.status from users u where u.id = d.user_id) <> 'active' then 'user_not_active' end
  ], null) $$;

-- ───────────── FR-DISP-04: ว่างไหมในช่วงเวลา (ใช้ตอน dispatch เฟส 5) ─────────────
-- ไม่ว่าง = มีช่วง blocked ทับ หรือมีงานที่ยัง active ทับ (รวมเวลากันชน buffer ทั้งก่อนและหลัง)
create or replace function driver_is_free(p_driver uuid, p_from timestamptz, p_to timestamptz,
                                          p_buffer_minutes int, p_ignore_booking uuid default null)
returns boolean language sql stable as $$
  select not exists (
           select 1 from availability a
            where a.driver_id = p_driver and a.kind = 'blocked'
              and a.period && tstzrange(p_from, p_to, '[)'))
     and not exists (
           select 1 from bookings b
            where b.driver_id = p_driver
              and b.id is distinct from p_ignore_booking
              and b.status in ('assigned','en_route','arrived','picked_up','dropped_off')
              and tstzrange(b.pickup_at - make_interval(mins => p_buffer_minutes),
                            b.est_end_at + make_interval(mins => p_buffer_minutes), '[)')
                  && tstzrange(p_from, p_to, '[)'))
$$;

-- vehicles: แก้ข้อมูลพื้นฐานได้เฉพาะตอนยังไม่อนุมัติ (บังคับใน service) · ทะเบียนเก็บตัวพิมพ์ใหญ่ไม่มีช่องว่าง
create or replace function vehicles_normalize() returns trigger language plpgsql as $$
begin
  new.plate := upper(regexp_replace(new.plate, '\s+', '', 'g'));
  return new;
end $$;
create trigger vehicles_00_normalize before insert or update of plate on vehicles
  for each row execute function vehicles_normalize();

-- หลังบ้านต้องรู้ว่าผูก LINE แล้วหรือยัง โดยไม่เปิดคอลัมน์ line_user_id ให้ client
create or replace function line_linked(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select line_user_id is not null from users where id = p_user and is_staff()
$$;

-- เรียกจาก client role ได้ (ฟังก์ชันหลักรับทั้งแถวซึ่งมีคอลัมน์ *_enc ที่ client อ่านไม่ได้)
-- คืนค่าเฉพาะ staff หรือเจ้าของข้อมูลเอง
create or replace function driver_reasons(p_driver uuid, ct car_type, on_date date) returns text[]
language sql stable security definer set search_path = public as $$
  select driver_ineligible_reasons(d, ct, on_date) from drivers d
   where d.user_id = p_driver and (is_staff() or d.user_id = app_user_id())
$$;

create or replace function vehicle_reasons(p_vehicle uuid, svc service_type, on_date date) returns text[]
language sql stable security definer set search_path = public as $$
  select vehicle_ineligible_reasons(v, svc, on_date) from vehicles v
   where v.id = p_vehicle and (is_staff() or v.driver_id = app_user_id())
$$;
