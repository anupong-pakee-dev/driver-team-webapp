-- เพิ่มแอดมินด้วยลิงก์เชิญ: เฉพาะ owner อ่านได้ · เขียนผ่านเซิร์ฟเวอร์เท่านั้น · สิทธิ์ต้องเป็นแอดมิน/เจ้าของ
begin;
select plan(6);
select tests.make_fixtures();

insert into staff_invites (email, role, display_name, token_hash, created_by, expires_at)
  values ('new.admin@example.com', 'sales_admin', 'แอดมินใหม่', 'h1', '00000000-0000-0000-0000-0000000000a1', now() + interval '72 hours');

select throws_ok($$ insert into staff_invites (email, role, display_name, token_hash, created_by, expires_at)
  values ('x@example.com', 'driver', 'x', 'h2', '00000000-0000-0000-0000-0000000000a1', now()) $$,
  '23514', null, 'invite role must be sales_admin or owner');
select throws_ok($$ insert into staff_invites (email, role, display_name, token_hash, created_by, expires_at)
  values ('Mixed@Example.com', 'owner', 'x', 'h3', '00000000-0000-0000-0000-0000000000a1', now()) $$,
  '23514', null, 'email is stored lower-case');

select tests.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from staff_invites), 1, 'owner reads invites');
select throws_ok($$ update staff_invites set expires_at = now() $$, '42501', null, 'owner cannot write invites directly');
select tests.reset_role();

select tests.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from staff_invites), 0, 'sales_admin cannot read invites');
select tests.reset_role();

select tests.act_as_anon();
select throws_ok($$ select 1 from staff_invites $$, '42501', null, 'anon has no access');
select tests.reset_role();

select * from finish();
rollback;
