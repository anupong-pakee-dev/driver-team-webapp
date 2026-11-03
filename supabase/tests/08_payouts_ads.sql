-- เฟส 6: payout ยอดตรงรายการ · งานหนึ่งจ่ายได้ครั้งเดียว · โอนแล้วแก้ไม่ได้ · touchpoint ไม่ยินยอมไม่ผูกคน · slug · RLS
begin;
select plan(10);
select tests.make_fixtures();

-- ยอดรวมต้องเท่ากับรายการ (ตรวจตอน commit — ใช้ set constraints immediate เพื่อทดสอบ)
set constraints payouts_match_items immediate;
select throws_ok($$ insert into payouts (driver_id, status, gross_satang) values ('00000000-0000-0000-0000-0000000000d1', 'ready', 1000) $$,
  'DT422', 'PAYOUT_TOTALS_MISMATCH', 'payout totals must match items');
set constraints payouts_match_items deferred;

insert into payouts (id, driver_id, status, gross_satang, commission_satang)
  values ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000000d1', 'ready', 95000, 19000);
insert into payout_items (payout_id, booking_id, gross_satang, commission_satang)
  values ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000000b1', 95000, 19000);
set constraints payouts_match_items immediate;
select is((select net_satang from payouts where id = '00000000-0000-0000-0000-00000000aa01'), 76000::bigint, 'net = gross − commission');
set constraints payouts_match_items deferred;

-- งานหนึ่งจ่ายคนขับได้ครั้งเดียว
insert into payouts (id, driver_id, status) values ('00000000-0000-0000-0000-00000000aa02', '00000000-0000-0000-0000-0000000000d1', 'ready');
select throws_ok($$ insert into payout_items (payout_id, booking_id) values ('00000000-0000-0000-0000-00000000aa02', '00000000-0000-0000-0000-0000000000b1') $$,
  '23505', null, 'a booking can be paid out only once');

-- paid ต้องมีหลักฐาน · หลัง paid แก้ไม่ได้
select throws_ok($$ update payouts set status = 'paid' where id = '00000000-0000-0000-0000-00000000aa01' $$, '23514', null, 'paid needs proof');
update payouts set status = 'paid', paid_at = now(), proof_file_path = 'x' where id = '00000000-0000-0000-0000-00000000aa01';
select throws_ok($$ update payouts set commission_satang = 0 where id = '00000000-0000-0000-0000-00000000aa01' $$,
  'DT409', 'PAYOUT_PAID_IMMUTABLE', 'paid payout is immutable');

-- FR-ADS-10: ไม่ยินยอม → ไม่เก็บ click id / ไม่ผูก user
select throws_ok($$ insert into touchpoints (anon_id, consented, click_id_type, click_id) values ('no-consent', false, 'gclid', 'abc') $$,
  '23514', null, 'no click id without consent');
select lives_ok($$ insert into touchpoints (anon_id, consented, click_id_type, click_id, user_id)
                   values ('a1', true, 'gclid', 'AbC', '00000000-0000-0000-0000-0000000000c1') $$, 'consented touch can carry click id + user');
select throws_ok($$ insert into campaigns (slug, platform, name) values ('Bad Slug', 'meta', 'x') $$, '23514', null, 'slug format enforced');

-- RLS: คนขับเห็น payout ของตัวเองเท่านั้น · ลูกค้าไม่เห็น touchpoints
select tests.act_as('00000000-0000-0000-0000-0000000000d2');
select is((select count(*)::int from payouts), 0, 'other driver sees no payouts');
select tests.reset_role();
select tests.act_as('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from touchpoints), 0, 'customers cannot read touchpoints');
select tests.reset_role();

select * from finish();
rollback;
