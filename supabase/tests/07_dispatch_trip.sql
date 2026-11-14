-- เฟส 5: เสนองานเฉพาะคนที่ผ่านเกณฑ์ ณ วันงาน + ว่าง · offer ค้างได้ทีละ 1 · check-in รูปบังคับ · append-only · RLS
begin;
select plan(13);
select tests.make_fixtures();

-- (ฐานข้อมูล local อาจมีคนขับสาธิตจาก seed:demo → กรองเฉพาะคนขับของ fixture)
-- ทำให้ d1+e1 ผ่านเกณฑ์ (d2+e2 ไม่ผ่าน: ไม่มีเอกสาร)
insert into allowed_registrations values ('airport_transfer', 'R1', 'test', current_date);
insert into license_coverage values ('T2', 'sedan');
update settings set value = value || '{"bg_check_valid_years":1}' where key = 'compliance';
update vehicles set kyc_status = 'approved', compulsory_insurance_expiry = current_date + 30, voluntary_insurance_usage = 'rental',
  voluntary_insurance_expiry = current_date + 30, passenger_insurance_expiry = current_date + 30, tax_expiry = current_date + 30,
  inspection_due = current_date + 30 where id = '00000000-0000-0000-0000-0000000000e1';
update drivers set kyc_status = 'approved', public_license_expiry = current_date + 365, background_check_passed = true,
  background_check_at = current_date where user_id = '00000000-0000-0000-0000-0000000000d1';
insert into consents (user_id, kind, version, granted, channel) values
  ('00000000-0000-0000-0000-0000000000d1', 'driver_contract', 'v', true, 't'), ('00000000-0000-0000-0000-0000000000d1', 'privacy', 'v', true, 't');
select tests.pay_deposit('00000000-0000-0000-0000-0000000000b1');
update bookings set status = 'confirmed' where id = '00000000-0000-0000-0000-0000000000b1';

-- FR-DISP-01: มีแค่ d1 (คนที่ไม่ผ่านเกณฑ์ไม่ได้ข้อเสนอ)
select results_eq($$ select driver_id from dispatch_candidates('00000000-0000-0000-0000-0000000000b1') where driver_id in ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2') $$,
  $$ values ('00000000-0000-0000-0000-0000000000d1'::uuid) $$, 'only the eligible driver is a candidate');
select is(assignment_problems('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000e2')
          @> array['kyc_not_approved'], true, 'ineligible driver has reasons');
select is(assignment_problems('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e2'),
          array['vehicle_mismatch'], 'cannot use another driver''s vehicle');

-- เอกสารหมดก่อนวันงาน → ไม่ได้ข้อเสนอ (BR-COMP-04)
update vehicles set compulsory_insurance_expiry = current_date + 1 where id = '00000000-0000-0000-0000-0000000000e1';
select is((select count(*)::int from dispatch_candidates('00000000-0000-0000-0000-0000000000b1') where driver_id in ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2')), 0, 'expires before job date → no candidate');
update vehicles set compulsory_insurance_expiry = current_date + 30 where id = '00000000-0000-0000-0000-0000000000e1';


-- ปิดปฏิทินชนเวลางาน → ไม่ว่าง
insert into availability (driver_id, period, kind)
  select '00000000-0000-0000-0000-0000000000d1', tstzrange(pickup_at - interval '30 minutes', pickup_at + interval '30 minutes'), 'blocked'
    from bookings where id = '00000000-0000-0000-0000-0000000000b1';
select is(assignment_problems('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1'),
          array['time_conflict'], 'blocked calendar → time_conflict');
delete from availability;

-- ประกาศงานถึงหลายคนพร้อมกันได้ (คนละคนขับ) แต่คนเดิมมี offer ค้างซ้ำไม่ได้ และไม่เสนอซ้ำคนเดิม
insert into job_offers (booking_id, driver_id, vehicle_id, expires_at)
  values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', now() + interval '15 minutes');
select lives_ok($$ insert into job_offers (booking_id, driver_id, expires_at)
                   values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d2', now() + interval '15 minutes') $$,
  'several drivers can hold an open offer for the same booking');
select throws_ok($$ insert into job_offers (booking_id, driver_id, expires_at)
                    values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', now()) $$,
  '23505', null, 'one open offer per driver per booking');
delete from job_offers where driver_id = '00000000-0000-0000-0000-0000000000d2';
select is((select count(*)::int from dispatch_candidates('00000000-0000-0000-0000-0000000000b1') where driver_id in ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2')), 0, 'already-offered driver excluded');
select is((select count(*)::int from dispatch_candidates('00000000-0000-0000-0000-0000000000b1', true) where driver_id in ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2')), 1, 'include_offered lists them for override');

-- check-in รูปบังคับ (FR-TRIP-02) + append-only
select throws_ok($$ insert into checkins (booking_id, kind, lat, lng) values ('00000000-0000-0000-0000-0000000000b1', 'pickup', 13.7, 100.5) $$,
  '23514', null, 'pickup check-in requires a photo');
insert into checkins (booking_id, kind, lat, lng) values ('00000000-0000-0000-0000-0000000000b1', 'arrive', 13.7, 100.5);
select throws_ok($$ update checkins set lat = 0 where booking_id = '00000000-0000-0000-0000-0000000000b1' $$, 'DT409', null, 'check-ins are append-only');

-- RLS: คนขับเห็นข้อเสนอของตัวเองเท่านั้น
select tests.act_as('00000000-0000-0000-0000-0000000000d2');
select is((select count(*)::int from job_offers), 0, 'other driver sees no offers');
select tests.reset_role();
select tests.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::int from job_offers), 1, 'driver sees own offer');
select tests.reset_role();

select * from finish();
rollback;
