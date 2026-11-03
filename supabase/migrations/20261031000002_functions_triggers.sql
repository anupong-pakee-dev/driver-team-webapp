-- System Design §4.4 audit · §6 state machine · §7.2 eligibility · §7.8 เลขที่เอกสาร

-- ───────────────────────── 4.4 Audit (FR-AUDIT-01) ─────────────────────────
-- API ตั้ง set_config('app.actor_id' | 'app.actor_role' | 'app.reason', …, true) ต้นทุก transaction
create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into audit_logs(actor_id, actor_role, action, entity, entity_id, before, after, reason)
  values (nullif(current_setting('app.actor_id', true), '')::uuid,
          nullif(current_setting('app.actor_role', true), ''),
          tg_op, tg_table_name,
          coalesce(rec->>'id', rec->>'user_id', rec->>'key',
                   -- ตารางที่ใช้ composite key
                   nullif(concat_ws(':', rec->>'service_type', rec->>'registration_type',
                                         rec->>'license_class', rec->>'car_type'), '')),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          nullif(current_setting('app.reason', true), ''));
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['price_rules','quotes','bookings','job_offers','payments','payouts','drivers',
                           'vehicles','documents','allowed_registrations','license_coverage','settings',
                           'users','campaigns','ad_spend']
  loop
    execute format('create trigger %I after insert or update or delete on %I
                    for each row execute function audit_row()', t || '_audit', t);
  end loop;
end $$;

create or replace function audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_logs is append-only'; end $$;
create trigger audit_no_update before update or delete on audit_logs
  for each row execute function audit_immutable();
create trigger audit_no_truncate before truncate on audit_logs
  for each statement execute function audit_immutable();

-- ───────────────────────── 6 State machine ─────────────────────────
-- seed ต้องตรงกับ src/domain/transitions.ts (มี unit test ตรวจ)
insert into booking_transitions (from_status, to_status) values
  ('awaiting_deposit','confirmed'), ('awaiting_deposit','expired'), ('awaiting_deposit','cancelled'),
  ('confirmed','assigned'), ('confirmed','cancelled'),
  ('assigned','confirmed'), ('assigned','en_route'), ('assigned','cancelled'),
  ('en_route','arrived'),
  ('arrived','picked_up'), ('arrived','no_show'),
  ('picked_up','dropped_off'),
  ('dropped_off','completed'), ('dropped_off','disputed'),
  ('disputed','completed');

-- BEFORE triggers รันตามลำดับชื่อ → ตั้งชื่อให้ status guard รันก่อน assignment guard
-- AC-7.1: เปลี่ยนสถานะนอกตาราง → error DT409 → API คืน 409
create or replace function bookings_status_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'awaiting_deposit' then
      raise exception 'INVALID_INITIAL_STATUS %', new.status using errcode = 'DT409';
    end if;
  elsif new.status is distinct from old.status
     and not exists (select 1 from booking_transitions
                     where from_status = old.status and to_status = new.status) then
    raise exception 'INVALID_TRANSITION % -> %', old.status, new.status using errcode = 'DT409';
  end if;
  return new;
end $$;
create trigger bookings_10_status_guard before insert or update of status on bookings
  for each row execute function bookings_status_guard();

-- สถานะ ∈ {assigned..completed, disputed} ต้องมี driver_id และ vehicle_id (เว้น driver_only)
create or replace function bookings_assignment_guard() returns trigger language plpgsql as $$
begin
  if new.status in ('assigned','en_route','arrived','picked_up','dropped_off','completed','disputed') then
    if new.driver_id is null then
      raise exception 'ASSIGNMENT_REQUIRES_DRIVER' using errcode = 'DT422';
    end if;
    if new.vehicle_id is null and new.car_type <> 'driver_only' then
      raise exception 'ASSIGNMENT_REQUIRES_VEHICLE' using errcode = 'DT422';
    end if;
  end if;
  return new;
end $$;
create trigger bookings_20_assignment_guard before insert or update on bookings
  for each row execute function bookings_assignment_guard();

-- ───────────────────────── เงิน: manual ต้อง owner อนุมัติ ─────────────────────────
create or replace function payments_manual_guard() returns trigger language plpgsql as $$
begin
  if new.method = 'manual' and new.status = 'verified'
     and not exists (select 1 from users where id = new.approved_by and role = 'owner' and status = 'active') then
    raise exception 'MANUAL_PAYMENT_REQUIRES_OWNER' using errcode = 'DT403';
  end if;
  return new;
end $$;
create trigger payments_manual_guard before insert or update on payments
  for each row execute function payments_manual_guard();

-- ───────────────────────── 7.8 เลขที่เอกสาร ─────────────────────────
-- เรียกใน transaction เดียวกับการสร้าง quote/receipt → rollback แล้วเลขไม่ถูกใช้ ไม่ข้าม
create or replace function next_number(p_prefix text) returns text language plpgsql as $$
declare per text := to_char(now() at time zone 'Asia/Bangkok', 'YYMM'); n int;
begin
  insert into number_sequences(prefix, period, last) values (p_prefix, per, 1)
  on conflict (prefix, period) do update set last = number_sequences.last + 1
  returning last into n;
  return format('%s-%s-%s', p_prefix, per, lpad(n::text, 4, '0'));
end $$;

-- ───────────────────────── 7.2 Eligibility (BR-COMP-01/02) ─────────────────────────
-- eligible ⇔ array ว่าง · ตรวจ ณ วันงาน ไม่ใช่วันนี้ (BR-COMP-04)
create or replace function vehicle_ineligible_reasons(v vehicles, svc service_type, on_date date)
returns text[] language sql stable as $$
  select array_remove(array[
    case when v.kyc_status <> 'approved' then 'kyc_not_approved' end,
    case when not exists (select 1 from allowed_registrations a
                          where a.service_type = svc and a.registration_type = v.registration_type)
         then 'registration_not_allowed' end,
    case when coalesce(v.compulsory_insurance_expiry, '-infinity'::date) < on_date then 'compulsory_ins_expired' end,
    case when v.voluntary_insurance_usage is null
           or v.voluntary_insurance_usage not in ('commercial_hire','rental','public')
         then 'insurance_usage_invalid' end,
    case when coalesce(v.voluntary_insurance_expiry, '-infinity'::date) < on_date then 'voluntary_ins_expired' end,
    case when coalesce(v.passenger_insurance_expiry, '-infinity'::date) < on_date then 'passenger_ins_expired' end,
    case when coalesce(v.tax_expiry, '-infinity'::date) < on_date then 'tax_expired' end,
    case when coalesce(v.inspection_due, '-infinity'::date) < on_date then 'inspection_due' end,
    case when not v.active then 'inactive' end
  ], null) $$;

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
    case when not exists (select 1 from consents c
                          where c.user_id = d.user_id and c.kind = 'driver_contract' and c.granted)
         then 'no_contract' end,
    case when (select u.status from users u where u.id = d.user_id) <> 'active' then 'user_not_active' end
  ], null) $$;
