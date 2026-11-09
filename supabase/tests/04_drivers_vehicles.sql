-- เฟส 2: kyc จากเอกสาร · consent ล่าสุด · ปฏิทินว่าง · สิทธิ์ลิงก์เชิญ/ข้อมูลลับในเอกสาร
begin;
select plan(16);
select tests.make_fixtures();

-- ───── refresh_kyc (FR-DRV-03) ─────
update settings set value = jsonb_set(value, '{required_docs}', '{"driver":["id_card","public_license"],"vehicle":["registration_book"]}')
 where key = 'compliance';
select is(refresh_kyc('driver', '00000000-0000-0000-0000-0000000000d1'), 'pending'::kyc_status, 'missing docs → pending');

-- fixture มี id_card อยู่แล้ว (pending) → อนุมัติ + เพิ่มใบขับขี่ที่ถูกปฏิเสธ
update documents set status = 'approved' where owner_id = '00000000-0000-0000-0000-0000000000d1' and doc_type = 'id_card';
insert into documents (owner_type, owner_id, doc_type, file_path, status)
  values ('driver', '00000000-0000-0000-0000-0000000000d1', 'public_license', 'x', 'rejected');
select is(refresh_kyc('driver', '00000000-0000-0000-0000-0000000000d1'), 'rejected'::kyc_status, 'latest required doc rejected → rejected');

insert into documents (owner_type, owner_id, doc_type, file_path, status, created_at)
  values ('driver', '00000000-0000-0000-0000-0000000000d1', 'public_license', 'y', 'approved', now() + interval '1 second');
select is(refresh_kyc('driver', '00000000-0000-0000-0000-0000000000d1'), 'approved'::kyc_status, 'all required approved → approved');
select is((select kyc_status from drivers where user_id = '00000000-0000-0000-0000-0000000000d1'), 'approved'::kyc_status,
  'drivers.kyc_status updated');

-- ส่งฉบับต่ออายุ (pending) → ยังอนุมัติอยู่
insert into documents (owner_type, owner_id, doc_type, file_path, created_at)
  values ('driver', '00000000-0000-0000-0000-0000000000d1', 'public_license', 'z', now() + interval '2 seconds');
select is(refresh_kyc('driver', '00000000-0000-0000-0000-0000000000d1'), 'approved'::kyc_status, 'pending renewal keeps approval');

-- เอกสารที่ผ่านหมดอายุทั้งหมด → หลุด
update documents set status = 'expired' where owner_id = '00000000-0000-0000-0000-0000000000d1' and doc_type = 'public_license' and status = 'approved';
select is(refresh_kyc('driver', '00000000-0000-0000-0000-0000000000d1'), 'pending'::kyc_status, 'expired approval → pending');

-- ───── has_consent: ใช้รายการล่าสุด (ถอนความยินยอมได้) ─────
insert into consents (user_id, kind, version, granted, channel, at) values
  ('00000000-0000-0000-0000-0000000000d2', 'privacy', 'v1', true,  'liff', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000d2', 'privacy', 'v1', false, 'liff', now());
select is(has_consent('00000000-0000-0000-0000-0000000000d2', 'privacy'), false, 'latest withdrawal wins');
select ok('no_privacy_consent' = any(driver_ineligible_reasons(d, 'sedan', current_date)), 'driver without privacy consent is not eligible')
  from drivers d where user_id = '00000000-0000-0000-0000-0000000000d2';

-- ───── driver_is_free (FR-DISP-04) ─────
insert into availability (driver_id, period, kind) values
  ('00000000-0000-0000-0000-0000000000d1', tstzrange('2030-01-01 10:00+07', '2030-01-01 12:00+07'), 'blocked');
select is(driver_is_free('00000000-0000-0000-0000-0000000000d1', '2030-01-01 11:00+07', '2030-01-01 13:00+07', 0), false, 'blocked period overlaps');
select is(driver_is_free('00000000-0000-0000-0000-0000000000d1', '2030-01-01 12:00+07', '2030-01-01 13:00+07', 0), true, 'touching edge is free');
select throws_ok($$ insert into availability (driver_id, period, kind) values
  ('00000000-0000-0000-0000-0000000000d1', tstzrange('2030-01-01 11:30+07', '2030-01-01 14:00+07'), 'blocked') $$,
  '23P01', null, 'overlapping blocks rejected by exclusion constraint');

-- งานที่รับแล้ว + buffer 60 นาที
update vehicles set kyc_status = 'approved' where id = '00000000-0000-0000-0000-0000000000e1';
select tests.pay_deposit('00000000-0000-0000-0000-0000000000b1');
update bookings set status = 'confirmed' where id = '00000000-0000-0000-0000-0000000000b1';
update bookings set status = 'assigned', driver_id = '00000000-0000-0000-0000-0000000000d1',
                    vehicle_id = '00000000-0000-0000-0000-0000000000e1' where id = '00000000-0000-0000-0000-0000000000b1';
select is(driver_is_free('00000000-0000-0000-0000-0000000000d1',
            (select est_end_at + interval '30 minutes' from bookings where id = '00000000-0000-0000-0000-0000000000b1'),
            (select est_end_at + interval '3 hours' from bookings where id = '00000000-0000-0000-0000-0000000000b1'), 60),
  false, 'job within buffer is a conflict');
select is(driver_is_free('00000000-0000-0000-0000-0000000000d1',
            (select est_end_at + interval '30 minutes' from bookings where id = '00000000-0000-0000-0000-0000000000b1'),
            (select est_end_at + interval '3 hours' from bookings where id = '00000000-0000-0000-0000-0000000000b1'), 0),
  true, 'same window without buffer is free');

-- ───── สิทธิ์ ─────
insert into driver_invites (user_id, token_hash, created_by, expires_at)
  values ('00000000-0000-0000-0000-0000000000d2', 'h', '00000000-0000-0000-0000-0000000000a1', now() + interval '72 hours');
select tests.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from driver_invites), 0, 'sales_admin cannot read invites');
select tests.reset_role();
select tests.act_as('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$ select data_enc from documents $$, '42501', null, 'driver cannot select documents.data_enc');
select is((select count(*)::int from driver_invites), 0, 'driver cannot read invites');
select tests.reset_role();

select * from finish();
rollback;
