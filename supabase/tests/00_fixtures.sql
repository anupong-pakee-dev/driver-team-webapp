-- ไม่ใช่ test: pg_prove รันไฟล์นี้ก่อนตามลำดับชื่อ เพื่อสร้างฟังก์ชันช่วยใน schema tests
-- (ทุก test ใช้ begin … rollback จึงไม่ทิ้งข้อมูล)
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);
create schema if not exists tests;

-- สวมบทบาทผู้ใช้ตาม users.auth_user_id
create or replace function tests.act_as(p_user uuid) returns void language plpgsql as $$
declare a uuid;
begin
  select auth_user_id into a from public.users where id = p_user;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function tests.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

create or replace function tests.reset_role() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ข้อมูลชุดมาตรฐาน: owner, sales, ลูกค้า 2, คนขับ 2, quote+booking ละ 1 ของลูกค้า 1 (คนขับ 1)
create or replace function tests.make_fixtures() returns void language plpgsql as $$
declare pr uuid; q uuid;
begin
  insert into public.users (id, auth_user_id, role, display_name, full_name_enc, phone_enc, phone_hash) values
    ('00000000-0000-0000-0000-0000000000a1', gen_random_uuid(), 'owner',       'owner',  '\x01', '\x01', 'h-owner'),
    ('00000000-0000-0000-0000-0000000000a2', gen_random_uuid(), 'sales_admin', 'sales',  '\x01', '\x01', 'h-sales'),
    ('00000000-0000-0000-0000-0000000000c1', gen_random_uuid(), 'customer',    'cust1',  '\x01', '\x01', 'h-c1'),
    ('00000000-0000-0000-0000-0000000000c2', gen_random_uuid(), 'customer',    'cust2',  '\x01', '\x01', 'h-c2'),
    ('00000000-0000-0000-0000-0000000000d1', gen_random_uuid(), 'driver',      'drv1',   '\x01', '\x01', 'h-d1'),
    ('00000000-0000-0000-0000-0000000000d2', gen_random_uuid(), 'driver',      'drv2',   '\x01', '\x01', 'h-d2');
  insert into public.drivers (user_id, public_license_class, bank_account_enc) values
    ('00000000-0000-0000-0000-0000000000d1', 'T2', '\x01'),
    ('00000000-0000-0000-0000-0000000000d2', 'T2', '\x01');
  insert into public.vehicles (id, driver_id, car_type, plate, seats, luggage, registration_type) values
    ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', 'sedan', 'TEST-1', 3, 2, 'R1'),
    ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2', 'sedan', 'TEST-2', 3, 2, 'R1');
  insert into public.documents (owner_type, owner_id, doc_type, file_path) values
    ('driver',  '00000000-0000-0000-0000-0000000000d1', 'id_card', 'drivers/d1/id.jpg'),
    ('driver',  '00000000-0000-0000-0000-0000000000d2', 'id_card', 'drivers/d2/id.jpg'),
    ('vehicle', '00000000-0000-0000-0000-0000000000e1', 'registration_book', 'vehicles/e1/reg.jpg');

  select id into pr from public.price_rules where car_type = 'sedan' and service_type = 'airport_transfer' limit 1;
  if pr is null then
    insert into public.price_rules (car_type, service_type, base_satang, floor_satang, tax_category)
    values ('sedan', 'airport_transfer', 80000, 70000, 'transport') returning id into pr;
  end if;

  insert into public.quotes (id, number, customer_id, created_by, service_type, car_type, origin, pickup_at, pax,
                             no_flight, price_rule_id, breakdown, computed_satang, final_satang, tax_category, status, expires_at)
  values ('00000000-0000-0000-0000-0000000000f1', 'Q-TEST-0001', '00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000c1', 'airport_transfer', 'sedan', '{"name":"BKK"}',
          now() + interval '3 days', 2, true, pr, '{}', 95000, 95000, 'transport', 'accepted', now() + interval '1 day')
  returning id into q;

  insert into public.bookings (id, quote_id, customer_id, service_type, car_type, pickup_at, est_end_at,
                               price_satang, deposit_satang, terms_version, terms_accepted_at)
  values ('00000000-0000-0000-0000-0000000000b1', q, '00000000-0000-0000-0000-0000000000c1', 'airport_transfer', 'sedan',
          now() + interval '3 days', now() + interval '3 days 2 hours', 95000, 28500, 'test', now());
end $$;

-- มัดจำครบ (เฟส 4: ยืนยันงานต้องมีมัดจำ verified)
create or replace function tests.pay_deposit(p_booking uuid) returns void language sql as $$
  insert into public.payments (booking_id, kind, method, amount_satang, status)
  select id, 'deposit', 'slip', deposit_satang, 'verified' from public.bookings where id = p_booking
$$;

grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

select pass('fixture helpers created');
select * from finish();
commit;
