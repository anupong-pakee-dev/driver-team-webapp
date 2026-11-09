-- schema, audit append-only, state machine guard, assignment guard, manual payment, next_number
begin;
select plan(17);

select is((select count(*)::int from pg_tables where schemaname = 'public'), 38, '38 tables (28 Req + 10 technical incl. driver_invites, route_cache, rate_limits, job_runs)');
select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0, 'RLS enabled on every table');
select is((select count(*)::int from booking_transitions), 15, 'booking_transitions seeded');

select tests.make_fixtures();

-- audit (FR-AUDIT-01)
select set_config('app.actor_id', '00000000-0000-0000-0000-0000000000a1', true);
select set_config('app.actor_role', 'owner', true);
select set_config('app.reason', 'test reason', true);
update settings set value = '0.25' where key = 'commission_rate';
select results_eq(
  $$ select actor_role, action, entity, entity_id, reason, after->>'value' from audit_logs
     where entity = 'settings' order by id desc limit 1 $$,
  $$ values ('owner'::text, 'UPDATE'::text, 'settings'::text, 'commission_rate'::text, 'test reason'::text, '0.25'::text) $$,
  'settings change is audited with actor and reason');
select throws_ok($$ update audit_logs set reason = 'x' $$, 'P0001', 'audit_logs is append-only', 'audit_logs cannot be updated');
select throws_ok($$ delete from audit_logs $$, 'P0001', 'audit_logs is append-only', 'audit_logs cannot be deleted');
select throws_ok($$ truncate audit_logs $$, 'P0001', 'audit_logs is append-only', 'audit_logs cannot be truncated');

-- state machine (AC-7.1)
select throws_ok($$ update bookings set status = 'completed' where id = '00000000-0000-0000-0000-0000000000b1' $$,
  'DT409', null, 'awaiting_deposit -> completed rejected');
select tests.pay_deposit('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$ update bookings set status = 'confirmed' where id = '00000000-0000-0000-0000-0000000000b1' $$,
  'awaiting_deposit -> confirmed allowed');
select throws_ok($$ update bookings set status = 'assigned' where id = '00000000-0000-0000-0000-0000000000b1' $$,
  'DT422', 'ASSIGNMENT_REQUIRES_DRIVER', 'assigned requires driver');
select throws_ok($$ update bookings set status = 'assigned', driver_id = '00000000-0000-0000-0000-0000000000d1'
                    where id = '00000000-0000-0000-0000-0000000000b1' $$,
  'DT422', 'ASSIGNMENT_REQUIRES_VEHICLE', 'assigned sedan requires vehicle');
select lives_ok($$ update bookings set status = 'assigned', driver_id = '00000000-0000-0000-0000-0000000000d1',
                    vehicle_id = '00000000-0000-0000-0000-0000000000e1' where id = '00000000-0000-0000-0000-0000000000b1' $$,
  'assigned with driver + vehicle allowed');

-- manual payment ต้องมี owner อนุมัติ
select throws_ok($$ insert into payments (booking_id, kind, method, amount_satang, status, approved_by)
                    values ('00000000-0000-0000-0000-0000000000b1', 'deposit', 'manual', 28500, 'verified',
                            '00000000-0000-0000-0000-0000000000a2') $$,
  'DT403', 'MANUAL_PAYMENT_REQUIRES_OWNER', 'sales_admin cannot approve manual payment');
select lives_ok($$ insert into payments (booking_id, kind, method, amount_satang, status, approved_by)
                   values ('00000000-0000-0000-0000-0000000000b1', 'deposit', 'manual', 28500, 'verified',
                           '00000000-0000-0000-0000-0000000000a1') $$,
  'owner can approve manual payment');

-- next_number ไม่ข้ามเมื่อ rollback (ADR-11)
select matches(next_number('T'), '^T-\d{4}-0001$', 'first number is 0001');
savepoint s1;
select next_number('T');
rollback to savepoint s1;
select matches(next_number('T'), '^T-\d{4}-0002$', 'rolled-back number is reused, no gap');

-- payout paid ต้องมีหลักฐาน
select throws_ok($$ insert into payouts (driver_id, status) values ('00000000-0000-0000-0000-0000000000d1', 'paid') $$,
  '23514', null, 'paid payout requires paid_at + proof');

select * from finish();
rollback;
