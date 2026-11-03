-- เฟส 4: ยืนยันงานต้องมีมัดจำ verified · ใบเสร็จแก้ไม่ได้/ออกได้เฉพาะเงินที่ verified · คืนเงินต้องมีหลักฐาน · RLS
begin;
select plan(11);
select tests.make_fixtures();

-- BR-PAY-01 ที่ฐานข้อมูล
select throws_ok($$ update bookings set status = 'confirmed' where id = '00000000-0000-0000-0000-0000000000b1' $$,
  'DT422', 'DEPOSIT_NOT_VERIFIED', 'cannot confirm without verified deposit');
insert into payments (id, booking_id, kind, method, amount_satang, status)
  values ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-0000000000b1', 'deposit', 'slip', 20000, 'verified');
select throws_ok($$ update bookings set status = 'confirmed' where id = '00000000-0000-0000-0000-0000000000b1' $$,
  'DT422', 'DEPOSIT_NOT_VERIFIED', 'partial deposit is not enough');
insert into payments (booking_id, kind, method, amount_satang, status, slip_ref)
  values ('00000000-0000-0000-0000-0000000000b1', 'deposit', 'slip', 8500, 'verified', 'REF-A');
select lives_ok($$ update bookings set status = 'confirmed' where id = '00000000-0000-0000-0000-0000000000b1' $$,
  'confirmed once verified deposits reach deposit_satang');

-- สลิปซ้ำ
select throws_ok($$ insert into payments (booking_id, kind, method, amount_satang, status, slip_ref)
                    values ('00000000-0000-0000-0000-0000000000b1', 'balance', 'slip', 100, 'pending', 'REF-A') $$,
  '23505', null, 'slip_ref is unique');

-- รายการค้างได้ทีละรายการต่อประเภท
insert into payments (booking_id, kind, method, amount_satang, status) values ('00000000-0000-0000-0000-0000000000b1', 'balance', 'slip', 66500, 'pending');
select throws_ok($$ insert into payments (booking_id, kind, method, amount_satang, status)
                    values ('00000000-0000-0000-0000-0000000000b1', 'balance', 'slip', 66500, 'pending') $$,
  '23505', null, 'only one open balance payment');

-- ใบเสร็จ
select throws_ok($$ insert into receipts (number, payment_id, amount_satang, tax_category)
                    select 'R-T-1', id, amount_satang, 'transport' from payments where kind = 'balance' and booking_id = '00000000-0000-0000-0000-0000000000b1' $$,
  'DT422', 'RECEIPT_REQUIRES_VERIFIED_PAYMENT', 'no receipt for unpaid payment');
insert into receipts (number, payment_id, amount_satang, tax_category)
  values (next_number('R'), '00000000-0000-0000-0000-000000000901', 20000, 'transport');
select throws_ok($$ update receipts set amount_satang = 1 $$, 'DT409', 'RECEIPT_IMMUTABLE', 'receipt amount immutable');
select throws_ok($$ delete from receipts $$, 'DT409', 'RECEIPT_IMMUTABLE', 'receipt cannot be deleted');

-- คืนเงิน
insert into payments (id, booking_id, kind, method, amount_satang, status)
  values ('00000000-0000-0000-0000-000000000909', '00000000-0000-0000-0000-0000000000b1', 'refund', 'manual', 1000, 'pending');
select throws_ok($$ update payments set status = 'refunded' where id = '00000000-0000-0000-0000-000000000909' $$,
  '23514', null, 'refund cannot be marked paid without proof');

-- RLS: ลูกค้าเห็นใบเสร็จของตัวเอง ลูกค้าอื่นไม่เห็น
select tests.act_as('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from receipts), 1, 'customer sees own receipt');
select tests.reset_role();
select tests.act_as('00000000-0000-0000-0000-0000000000c2');
select is((select count(*)::int from receipts) + (select count(*)::int from payments), 0, 'other customer sees no receipts/payments');
select tests.reset_role();

select * from finish();
rollback;
