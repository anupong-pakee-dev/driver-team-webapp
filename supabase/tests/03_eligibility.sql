-- §7.2 eligibility · ตรวจ ณ วันงาน
begin;
select plan(8);
select tests.make_fixtures();

-- ไม่มีอะไรเลย → ไม่ eligible พร้อมเหตุผลครบ
select set_eq(
  $$ select unnest(vehicle_ineligible_reasons(v, 'airport_transfer', current_date + 3)) from vehicles v
     where id = '00000000-0000-0000-0000-0000000000e1' $$,
  array['kyc_not_approved','registration_not_allowed','compulsory_ins_expired','insurance_usage_invalid',
        'voluntary_ins_expired','passenger_ins_expired','tax_expired','inspection_due'],
  'empty vehicle has every reason');

-- ทำให้ครบ
insert into allowed_registrations values ('airport_transfer', 'R1', 'test', current_date);
insert into license_coverage values ('T2', 'sedan');
update vehicles set kyc_status = 'approved', compulsory_insurance_expiry = current_date + 30,
  voluntary_insurance_usage = 'commercial_hire', voluntary_insurance_expiry = current_date + 30,
  passenger_insurance_expiry = current_date + 30, tax_expiry = current_date + 30, inspection_due = current_date + 30
  where id = '00000000-0000-0000-0000-0000000000e1';
select is((select vehicle_ineligible_reasons(v, 'airport_transfer', current_date + 3) from vehicles v
           where id = '00000000-0000-0000-0000-0000000000e1'), '{}'::text[], 'complete vehicle is eligible');

-- BR-COMP-04: เอกสารหมดก่อนวันงาน
select is((select vehicle_ineligible_reasons(v, 'airport_transfer', current_date + 60) from vehicles v
           where id = '00000000-0000-0000-0000-0000000000e1'),
  array['compulsory_ins_expired','voluntary_ins_expired','passenger_ins_expired','tax_expired','inspection_due'],
  'docs expiring before job date are caught');

-- ประกันแบบส่วนบุคคล
update vehicles set voluntary_insurance_usage = 'private' where id = '00000000-0000-0000-0000-0000000000e1';
select is((select vehicle_ineligible_reasons(v, 'airport_transfer', current_date + 3) from vehicles v
           where id = '00000000-0000-0000-0000-0000000000e1'), array['insurance_usage_invalid'], 'private insurance rejected');

-- คนขับ: bg_check_valid_years ยังเป็น null → ไม่ผ่านเสมอ
update drivers set kyc_status = 'approved', public_license_expiry = current_date + 365,
  background_check_passed = true, background_check_at = current_date - 10
  where user_id = '00000000-0000-0000-0000-0000000000d1';
insert into consents (user_id, kind, version, granted, channel)
  values ('00000000-0000-0000-0000-0000000000d1', 'driver_contract', 'v1', true, 'liff'),
         ('00000000-0000-0000-0000-0000000000d1', 'privacy', 'v1', true, 'liff');
update settings set value = '{"bg_check_valid_years":null}' where key = 'compliance';
select is((select driver_ineligible_reasons(d, 'sedan', current_date + 3) from drivers d
           where user_id = '00000000-0000-0000-0000-0000000000d1'), array['background_check'],
  'null bg_check_valid_years blocks everyone');

update settings set value = '{"bg_check_valid_years":1}' where key = 'compliance';
select is((select driver_ineligible_reasons(d, 'sedan', current_date + 3) from drivers d
           where user_id = '00000000-0000-0000-0000-0000000000d1'), '{}'::text[], 'complete driver is eligible');

select is((select driver_ineligible_reasons(d, 'van', current_date + 3) from drivers d
           where user_id = '00000000-0000-0000-0000-0000000000d1'), array['license_class_mismatch'],
  'license class must cover car type');

-- เอกสารรถที่ไม่อยู่ในรายการต้องส่ง → ไม่ตรวจวันหมดอายุ (เหลือ พ.ร.บ. + ภาคสมัครใจ)
update settings set value = jsonb_set(value, '{required_docs,vehicle}', '["compulsory_ins","voluntary_ins"]') where key = 'compliance';
update vehicles set voluntary_insurance_usage = 'commercial_hire' where id = '00000000-0000-0000-0000-0000000000e1';
select is((select vehicle_ineligible_reasons(v, 'airport_transfer', current_date + 60) from vehicles v
           where id = '00000000-0000-0000-0000-0000000000e1'),
  array['compulsory_ins_expired','voluntary_ins_expired'],
  'only required vehicle documents are checked for expiry');

select * from finish();
rollback;
