-- สมัครเป็นคนขับผ่าน QR สาธารณะ → เจ้าของอนุมัติ/ปฏิเสธ (คู่กับลิงก์เชิญเฉพาะคนแบบเดิม)
-- ผู้สมัครยังไม่ใช่ผู้ใช้ในระบบจนกว่าจะอนุมัติ · อนุมัติแล้วจึงสร้างบัญชีคนขับ (ผูก LINE ที่ใช้สมัคร)
-- ได้งานจริงยังต้องผ่านเอกสาร + ตรวจประวัติ + สัญญา ตามเกณฑ์เดิม

create table driver_applications (
  id             uuid primary key default gen_random_uuid(),
  line_user_id   text not null,
  nickname       text not null check (length(nickname) between 1 and 50),
  full_name_enc  bytea not null,
  phone_enc      bytea not null,
  phone_hash     text not null,
  status         text not null default 'pending' check (status in ('pending','approved','rejected')),
  reject_reason  text,
  user_id        uuid references users(id),          -- บัญชีคนขับที่สร้างตอนอนุมัติ
  decided_by     uuid references users(id),
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  check (status <> 'rejected' or reject_reason is not null)
);
-- LINE หนึ่งบัญชีมีใบสมัครที่รอพิจารณาได้ใบเดียว
create unique index driver_applications_one_pending on driver_applications (line_user_id) where status = 'pending';
create index on driver_applications (status, created_at desc);

alter table driver_applications enable row level security;
revoke all on driver_applications from anon;
revoke insert, update, delete, truncate, references, trigger on driver_applications from authenticated;
-- อ่านได้เฉพาะเจ้าของ (ข้อมูลเข้ารหัสอ่านไม่ได้อยู่แล้ว · เขียนผ่านเซิร์ฟเวอร์เท่านั้น)
create policy driver_applications_read on driver_applications for select using (app_role() = 'owner');
create trigger driver_applications_audit after insert or update or delete on driver_applications
  for each row execute function audit_row();
