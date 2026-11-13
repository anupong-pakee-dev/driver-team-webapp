-- ประหยัดโควตา LINE OA: เปิด/ปิดการ push ทีละประเภท (แก้ได้ในหลังบ้าน → ตั้งค่า)
-- ค่าเริ่มต้นตามที่เจ้าของเลือก: เก็บใบเสนอราคา ข้อเสนองาน ยืนยันการจอง/ได้คนขับ เตือนก่อนเดินทาง และได้งาน/ปิดงาน
-- ปิด = ไม่ส่ง LINE เท่านั้น ข้อมูลยังเห็นในแอป/เว็บ · ข้อความตอบกลับปุ่มในแชท (reply) ไม่นับโควตาและไม่ถูกปิด
insert into settings (key, value) values
  ('line_push', '{"quotes": true, "offers": true, "booking": true, "reminders": true, "job_closed": true,
                  "payments": false, "cancellations": false, "trip_end": false, "driver_admin": false, "staff": false}')
on conflict (key) do nothing;
