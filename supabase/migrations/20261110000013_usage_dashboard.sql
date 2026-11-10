-- หน้าภาพรวมการใช้งาน: นับผู้เข้าชมแบบไม่ระบุตัวตน + เพดานแพ็กเกจของบริการภายนอก

-- 1 แถว = 1 การเปิดหน้า · visitor = hash(เกลือรายวัน + IP + UA) ย้อนเป็น IP ไม่ได้ · ไม่มีคุกกี้ · เก็บ 13 เดือน (cleanup)
create table page_views (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  day       date not null default (now() at time zone 'Asia/Bangkok')::date,
  path      text not null,
  visitor   text not null,
  locale    text,
  referrer  text            -- เฉพาะ host ของเว็บที่ส่งมา
);
create index on page_views (day);
create index on page_views (day, visitor);
alter table page_views enable row level security;
revoke all on page_views from anon, authenticated;
grant select on page_views to authenticated;
create policy page_views_read on page_views for select using (is_staff());

-- เพดานแพ็กเกจ (เจ้าของแก้ได้หลังอัปเกรด) · LINE ดึงโควตาจริงจาก LINE API · null = ไม่แสดงเพดาน
insert into settings (key, value) values
  ('plan_limits', '{"db_mb": 500, "storage_mb": 1024, "line_messages": null, "note": "Supabase Free: DB 500 MB, Storage 1 GB · Pro: DB 8 GB, Storage 100 GB"}')
on conflict (key) do nothing;
