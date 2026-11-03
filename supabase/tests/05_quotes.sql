-- เฟส 3: ใบเสนอราคาแก้ราคาทับไม่ได้ · กฎราคาไม่ซ้อน · catalog_available · สิทธิ์ route_cache
begin;
select plan(9);
select tests.make_fixtures();

-- BR-QUOTE-03: ส่งแล้วแก้ราคาทับไม่ได้ (fixture quote = accepted)
select throws_ok($$ update quotes set discount_satang = 1000, final_satang = 94000 where id = '00000000-0000-0000-0000-0000000000f1' $$,
  'DT409', 'QUOTE_PRICE_IMMUTABLE', 'sent/accepted quote price is immutable');
select lives_ok($$ update quotes set status = 'expired' where id = '00000000-0000-0000-0000-0000000000f1' $$,
  'status may still change');

-- FR-PRICE-02: กฎ active ซ้อนกันไม่ได้
select throws_ok($$ insert into price_rules (car_type, service_type, base_satang, floor_satang, tax_category)
                    values ('sedan', 'airport_transfer', 1, 1, 'transport') $$,
  '23P01', null, 'overlapping active price rule rejected');
select lives_ok($$
  with closed as (update price_rules set active_to = now() where car_type = 'sedan' and service_type = 'airport_transfer'
                    and active_to is null returning 1)
  insert into price_rules (car_type, service_type, base_satang, floor_satang, tax_category, active_from)
  select 'sedan', 'airport_transfer', 90000, 80000, 'transport', now() from closed limit 1 $$,
  'close-then-insert creates a new version');
select is((select count(*)::int from price_rules where car_type = 'sedan' and service_type = 'airport_transfer'
            and active_from <= now() and (active_to is null or active_to > now())), 1, 'exactly one active sedan/airport rule');

-- FR-CAT-01: ไม่มีรถ eligible → ไม่มีอะไรขาย
delete from allowed_registrations;
select is((select count(*)::int from catalog_available(current_date) where car_type <> 'driver_only'), 0,
  'no eligible vehicle → nothing in catalog');
-- ทำให้รถ e1 + คนขับ d1 eligible
insert into allowed_registrations values ('airport_transfer', 'R1', 'test', current_date);
insert into license_coverage values ('T2', 'sedan');
update settings set value = value || '{"bg_check_valid_years":1}' where key = 'compliance';
update vehicles set kyc_status = 'approved', compulsory_insurance_expiry = current_date + 30,
  voluntary_insurance_usage = 'rental', voluntary_insurance_expiry = current_date + 30,
  passenger_insurance_expiry = current_date + 30, tax_expiry = current_date + 30, inspection_due = current_date + 30
  where id = '00000000-0000-0000-0000-0000000000e1';
update drivers set kyc_status = 'approved', public_license_expiry = current_date + 365,
  background_check_passed = true, background_check_at = current_date
  where user_id = '00000000-0000-0000-0000-0000000000d1';
insert into consents (user_id, kind, version, granted, channel) values
  ('00000000-0000-0000-0000-0000000000d1', 'driver_contract', 'v', true, 't'),
  ('00000000-0000-0000-0000-0000000000d1', 'privacy', 'v', true, 't');
select set_eq($$ select service_type::text || '/' || car_type::text from catalog_available(current_date) $$,
  array['airport_transfer/sedan', 'airport_transfer/driver_only', 'point_to_point/driver_only', 'hourly_charter/driver_only',
        'daily_charter/driver_only', 'driver_only/driver_only'], 'eligible vehicle and driver appear');

select tests.act_as_anon();
select is((select count(*)::int from catalog_available(current_date)), 6, 'anon can call catalog_available');
select tests.reset_role();
select tests.act_as('00000000-0000-0000-0000-0000000000c1');
select throws_ok($$ select * from route_cache $$, '42501', null, 'clients cannot read route_cache');
select tests.reset_role();

select * from finish();
rollback;
