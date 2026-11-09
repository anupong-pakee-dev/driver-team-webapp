-- ไม่ใช้ API แผนที่ที่ต้องผูกบัตร: ลูกค้าส่งพิกัดเอง (GPS / ปักหมุด OpenStreetMap / ลิงก์ Google Maps)
-- ระยะทาง = ระยะเส้นตรงผ่านทุกจุด × road_factor · เวลา = ระยะ ÷ avg_kmh (src/domain/geo.ts)

alter table quotes drop constraint quotes_distance_source_check;
alter table quotes add constraint quotes_distance_source_check
  check (distance_source in ('routes_api', 'manual', 'estimate'));   -- routes_api = ใบเสนอราคาเก่าก่อนเปลี่ยน

-- เจ้าของปรับตัวคูณได้ที่ /admin/settings ถ้าราคาประมาณต่ำ/สูงกว่าระยะถนนจริงสม่ำเสมอ
insert into settings (key, value) values ('route_estimate', '{"road_factor": 1.35, "avg_kmh": 50}')
on conflict (key) do nothing;
