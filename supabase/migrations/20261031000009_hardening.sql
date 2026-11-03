-- เฟส 7 (S7) ความแข็งแรง: rate limit · บันทึกผลงานอัตโนมัติ · export audit · degraded mode

-- §8.3 rate limit แบบ fixed window (ตารางเทคนิค) — ใช้ได้กับ serverless หลาย instance
create table rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key, window_start)
);
alter table rate_limits enable row level security;
revoke all on rate_limits from anon, authenticated;

create or replace function rate_hit(p_key text, p_window_seconds int) returns int
language sql as $$
  insert into rate_limits (key, window_start, count)
  values (p_key, to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds), 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count
$$;

-- §10 "บันทึกผลทุกรอบ" / §14: ดูได้ว่างานอัตโนมัติรันล่าสุดเมื่อไร สำเร็จไหม (ตารางเทคนิค)
create table job_runs (
  id       bigint generated always as identity primary key,
  name     text not null,
  started  timestamptz not null default now(),
  ok       boolean not null,
  ms       int not null,
  result   jsonb,
  error    text
);
create index on job_runs (name, started desc);
alter table job_runs enable row level security;
revoke all on job_runs from anon;
revoke insert, update, delete, truncate, references, trigger on job_runs from authenticated;
create policy job_runs_read on job_runs for select using (is_staff());

-- outbox: แอดมินเห็นข้อความค้างส่งเพื่อโทรแทน (§14 degraded mode)
create policy outbox_read on outbox for select using (is_staff());
grant select on outbox to authenticated;

-- §10 audit_export: bucket ส่วนตัวสำหรับไฟล์ audit รายวัน (production ควรชี้ไปที่เก็บภายนอกแบบเขียนครั้งเดียว ❓)
insert into storage.buckets (id, name, public) values ('audit-exports', 'audit-exports', false) on conflict (id) do nothing;
