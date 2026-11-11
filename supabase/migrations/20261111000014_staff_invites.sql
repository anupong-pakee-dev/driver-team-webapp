-- เพิ่มแอดมิน/เจ้าของจากหลังบ้าน: owner สร้างลิงก์เชิญ (ใช้ครั้งเดียว 72 ชม.)
-- ผู้ได้รับเชิญตั้งรหัสผ่านเอง → สร้างบัญชี Supabase Auth + users (ไม่ต้องใช้ระบบส่งอีเมล)

create table staff_invites (
  id            uuid primary key default gen_random_uuid(),
  email         text not null check (email = lower(email) and length(email) <= 254),
  role          user_role not null check (role in ('sales_admin','owner')),
  display_name  text not null check (length(display_name) between 1 and 60),
  token_hash    text not null unique,                    -- sha256(token) — ไม่เก็บ token ดิบ
  created_by    uuid not null references users(id),
  expires_at    timestamptz not null,
  used_at       timestamptz,
  used_by       uuid references users(id),
  created_at    timestamptz not null default now()
);
-- ลิงก์ที่ยังใช้ได้ต่ออีเมลมีได้อันเดียว (ยกเลิก = ตั้ง expires_at เป็นตอนนี้)
create index on staff_invites (email) where used_at is null;

alter table staff_invites enable row level security;
revoke all on staff_invites from anon;
revoke insert, update, delete, truncate, references, trigger on staff_invites from authenticated;
create policy staff_invites_read on staff_invites for select using (app_role() = 'owner');
create trigger staff_invites_audit after insert or update or delete on staff_invites
  for each row execute function audit_row();
