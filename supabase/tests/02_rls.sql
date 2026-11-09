-- RLS ต่อ role (§5) · ข้อมูลอ่อนไหวอ่านไม่ได้ · client เขียนไม่ได้
begin;
select plan(20);
select tests.make_fixtures();

-- ลูกค้า 1
select tests.act_as('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from quotes), 1, 'customer sees own quote');
select is((select count(*)::int from bookings), 1, 'customer sees own booking');
select is((select count(*)::int from users), 1, 'customer sees only own user row');
select is((select count(*)::int from documents), 0, 'customer sees no KYC documents');
select is((select count(*)::int from settings), 0, 'customer cannot read settings');
select is((select count(*)::int from audit_logs), 0, 'customer cannot read audit');
select throws_ok($$ select phone_enc from users $$, '42501', null, 'customer cannot select phone_enc');
select throws_ok($$ update bookings set status = 'cancelled' $$, '42501', null, 'customer cannot write bookings directly');
select tests.reset_role();

-- ลูกค้า 2
select tests.act_as('00000000-0000-0000-0000-0000000000c2');
select is((select count(*)::int from quotes), 0, 'other customer sees no quotes');
select is((select count(*)::int from bookings), 0, 'other customer sees no bookings');
select tests.reset_role();

-- คนขับ 2 (ไม่ใช่คนขับของงาน)
select tests.act_as('00000000-0000-0000-0000-0000000000d2');
select is((select count(*)::int from bookings), 0, 'unassigned driver cannot see booking');
select is((select count(*)::int from vehicles), 1, 'driver sees only own vehicle');
select is((select count(*)::int from documents), 1, 'driver sees only own documents');
select throws_ok($$ select bank_account_enc from drivers $$, '42501', null, 'driver cannot select bank_account_enc');
select tests.reset_role();

-- sales_admin
select tests.act_as('00000000-0000-0000-0000-0000000000a2');
select ok((select count(*) from bookings) >= 1, 'sales_admin sees bookings');
select is((select count(*)::int from documents), 0, 'sales_admin cannot see KYC documents');
select ok((select count(*) from settings) > 0, 'sales_admin reads settings');
select tests.reset_role();

-- owner
select tests.act_as('00000000-0000-0000-0000-0000000000a1');
select ok((select count(*) from documents) >= 3, 'owner sees all KYC documents');
select tests.reset_role();

-- anon
select tests.act_as_anon();
select ok((select count(*) from price_rules) > 0, 'anon reads price_rules for catalog');
select throws_ok($$ select count(*) from bookings $$, '42501', null, 'anon cannot read bookings');
select tests.reset_role();

select * from finish();
rollback;
