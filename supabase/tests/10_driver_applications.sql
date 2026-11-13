-- สมัครเป็นคนขับผ่าน QR: เฉพาะเจ้าของอ่านได้ · เขียนผ่านเซิร์ฟเวอร์เท่านั้น · ใบที่รอพิจารณาได้ใบเดียวต่อ LINE
begin;
select plan(6);
select tests.make_fixtures();

insert into driver_applications (line_user_id, nickname, full_name_enc, phone_enc, phone_hash)
  values ('Uapply-1', 'สมชาย', '\x01', '\x01', 'h-apply-1');

select throws_ok($$ insert into driver_applications (line_user_id, nickname, full_name_enc, phone_enc, phone_hash)
  values ('Uapply-1', 'ซ้ำ', '\x01', '\x01', 'h-apply-2') $$, '23505', null, 'one pending application per LINE account');
select throws_ok($$ update driver_applications set status = 'rejected' where line_user_id = 'Uapply-1' $$,
  '23514', null, 'rejecting needs a reason');

select tests.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from driver_applications), 1, 'owner reads applications');
select throws_ok($$ update driver_applications set status = 'approved' $$, '42501', null, 'owner cannot write applications directly');
select tests.reset_role();

select tests.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from driver_applications), 0, 'sales_admin cannot read applications');
select tests.reset_role();

select tests.act_as_anon();
select throws_ok($$ select 1 from driver_applications $$, '42501', null, 'anon has no access');
select tests.reset_role();

select * from finish();
rollback;
