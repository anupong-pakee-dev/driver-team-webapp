-- Seed สำหรับ local/staging เท่านั้น (System Design §16)
-- ⚠️ ราคาในไฟล์นี้เป็นตัวเลขตัวอย่างจาก mockup — ต้องแทนด้วยตารางราคาจริง (Pilot 2.2) ก่อนเปิดใช้
-- ⚠️ allowed_registrations / license_coverage ตั้งใจเว้นว่าง: กรอกจากคำตอบ ขบ. เท่านั้น (ว่าง = ไม่มีใครรับงานได้)

insert into settings (key, value) values
  ('deposit_pct',              '0.30'),
  ('deposit_window_minutes',   '120'),
  ('admin_max_discount',       '0.10'),
  ('commission_rate',          '0.20'),
  ('offer_ttl_minutes',        '15'),
  ('offer_ttl_urgent_minutes', '5'),
  ('buffer_minutes',           '60'),
  ('contact_window_hours',     '2'),
  ('auto_complete_hours',      '24'),
  ('far_from_target_m',        '500'),
  ('cancellation_policy',      '{"full_refund_hours":48,"mid":{"refundPct":50,"driverPct":25},"late":{"driverPct":50},"noShowDriverPct":50}'),
  ('compliance',               '{"bg_check_valid_years":null,"doc_reminder_days":[30,7,1],"invite_ttl_hours":72,
                                 "required_docs":{"driver":["id_card","public_license","selfie_with_id","bank_book"],
                                                  "vehicle":["registration_book","compulsory_ins","voluntary_ins","passenger_ins","tax_receipt","inspection","vehicle_photo"]}}'),
  -- ❓ รายการต้องยืนยันกับ ขบ. (T1) — ใช้เป็นตัวเลือกในฟอร์ม · การอนุญาตจริงอยู่ที่ allowed_registrations / license_coverage
  ('registration_types', '[
     {"code":"ry1","label_th":"รย.1 รถยนต์นั่งส่วนบุคคลไม่เกิน 7 คน"},
     {"code":"ry2","label_th":"รย.2 รถยนต์นั่งส่วนบุคคลเกิน 7 คน"},
     {"code":"ry5","label_th":"รย.5 รถยนต์รับจ้างระหว่างจังหวัด"},
     {"code":"ry6","label_th":"รย.6 รถยนต์รับจ้างบรรทุกคนโดยสารไม่เกิน 7 คน"},
     {"code":"ry10","label_th":"รย.10 รถยนต์บริการทัศนาจร"},
     {"code":"ry11","label_th":"รย.11 รถยนต์บริการให้เช่า"},
     {"code":"transport_nonfixed","label_th":"รถโดยสารไม่ประจำทาง (พ.ร.บ.การขนส่งทางบก)"},
     {"code":"transport_private","label_th":"รถขนส่งส่วนบุคคล (พ.ร.บ.การขนส่งทางบก)"}
   ]'),
  ('license_classes', '[
     {"code":"car_private","label_th":"ใบขับขี่รถยนต์ส่วนบุคคล"},
     {"code":"car_public","label_th":"ใบขับขี่รถยนต์สาธารณะ"},
     {"code":"transport_t1","label_th":"ใบขับขี่ขนส่ง ท.1"},
     {"code":"transport_t2","label_th":"ใบขับขี่ขนส่ง ท.2"},
     {"code":"transport_t3","label_th":"ใบขับขี่ขนส่ง ท.3"},
     {"code":"transport_t4","label_th":"ใบขับขี่ขนส่ง ท.4"}
   ]'),
  -- ❓ เนื้อหาสัญญา/Privacy Notice รอทนาย — version เปลี่ยน = คนขับต้องกดยอมรับใหม่
  -- FR-BOOK-03 ❓ Terms / Privacy ลูกค้า รอทนาย — version เปลี่ยน = ต้องยอมรับใหม่ตอนจองครั้งถัดไป
  ('customer_terms', '{"terms_version":"draft-2026-10","privacy_version":"draft-2026-10"}'),
  -- ⚠️ ข้อมูลบริษัทตัวอย่าง — พร้อมเพย์/บัญชีต้องเป็นของบริษัทเท่านั้น (BR-PAY-04)
  ('company', '{"name_th":"[ชื่อบริษัท]","tax_id":"","address_th":"","promptpay_id":"0812345678",
                "accounts":["0812345678"],"account_name":"[ชื่อบัญชีบริษัท]"}'),
  -- BR-PAY-03 ยอดคงเหลือ: before_start (ค่าเริ่ม) / after_end ต่อบริการ
  ('balance_due', '{"default":"before_start"}'),
  ('slip_rate_limit_per_hour', '10'),
  -- เฟส 6 payout ⚙️ ❓ อัตรา/ฐานหัก ณ ที่จ่ายจากนักบัญชี (T2) · ค่าคอมจากส่วนคนขับกรณียกเลิก (T9)
  ('withholding',              '{"rate":null,"base":"after_commission"}'),
  ('commission_on_cancellation','false'),
  -- เฟส 6 แอด
  ('line_oa_url',              '""'),                -- ลิงก์เพิ่มเพื่อน LINE OA (https://lin.ee/...)
  ('attribution_days',         '30'),
  ('landing_published',        '{}'),                -- FR-ADS-17 เปิดหลังเจ้าของยืนยันเช็กลิสต์
  ('privacy_notice', '{"customer_version":"draft-2026-10","driver_version":"draft-2026-10"}'),
  -- เฟส 5 วันงาน ⚙️
  ('depart_window_hours',      '3'),                 -- กดออกเดินทางได้ตั้งแต่ pickup − 3 ชม.
  ('block_start_if_unpaid',    'false'),             -- ❓ T10 ยอดคงเหลือไม่จ่าย: บล็อกหรือแค่แจ้ง owner
  ('airport_free_wait_minutes','60'),                -- BR-PRICE-05 สนามบินขาเข้า
  ('contact_rate_limit_per_day','20'),               -- §8.3
  ('emergency', '{"owner_phone":"","numbers":[{"label":"ตำรวจ","phone":"191"},{"label":"เจ็บป่วยฉุกเฉิน","phone":"1669"}]}'),
  ('driver_terms', '{"contract_version":"draft-2026-10","privacy_version":"draft-2026-10"}'),
  ('payment_adapter',          '"slip"'),
  ('vat_registered',           'false'),
  ('penalties_enabled',        'false'),
  ('partners_enabled',         'false'),
  ('capi_enabled',             'false'),
  ('session_hours',            '12'),
  ('quote_ttl_hours',          '24'),
  ('quote_min_lead_minutes',   '120'),             -- จองล่วงหน้าอย่างน้อย ⚙️
  ('quote_rate_limit_per_hour','10'),              -- §8.3 กันค่าใช้จ่าย Routes API
  ('route_cache_days',         '7'),
  -- ⚠️ ค่าตัวอย่าง: ที่นั่งเด็ก / จุดแวะ (สตางค์) — ตั้งจากตารางราคาจริง
  ('extras',                   '{"child_seat_satang":10000,"stop_satang":10000}'),
  -- §9.3 สนามบิน: place_id ของ Google ต้องตั้งก่อนใช้ Routes API จริง (ค่า stub: ใช้บน local)
  ('airports', '{"BKK":{"place_id":"stub:BKK","name":"ท่าอากาศยานสุวรรณภูมิ (BKK)","lat":13.69,"lng":100.7501},
                 "DMK":{"place_id":"stub:DMK","name":"ท่าอากาศยานดอนเมือง (DMK)","lat":13.9126,"lng":100.6068}}'),
  ('charter_hours',            '{"hourly_charter":[5,10],"daily_charter":[10],"driver_only":[5,10]}'),
  ('brand',                    '{"name_th":"[ชื่อแบรนด์ทีม]","name_en":"[Team brand]"}'),
  -- ข้อความแคตตาล็อกต่อประเภทรถ (FR-CAT-01) — ที่นั่ง/กระเป๋าที่โฆษณา ไม่ใช่ของรถคันใดคันหนึ่ง
  ('catalog', '{
     "tabs": [
       {"service_type":"airport_transfer","label_th":"สนามบิน","label_en":"Airport",
        "note_th":"สนามบิน ↔ กรุงเทพฯ · ราคาต่อเที่ยว รวมน้ำมันและคนขับ","note_en":"Airport ↔ Bangkok · per trip, fuel and driver included"},
       {"service_type":"daily_charter","label_th":"เหมารายวัน","label_en":"Daily",
        "note_th":"เหมาทั้งวัน 10 ชม. · รวมน้ำมันและคนขับ","note_en":"Full day, 10 hrs · fuel and driver included"},
       {"service_type":"point_to_point","label_th":"ต่างจังหวัด","label_en":"Upcountry",
        "note_th":"กรุงเทพฯ ↔ ต่างจังหวัด · ราคาตามระยะทาง","note_en":"Bangkok ↔ provinces · priced by distance"}
     ],
     "cars": {
       "sedan":       {"name_th":"รถเก๋ง","name_en":"Sedan","seats":3,"luggage":2},
       "suv":         {"name_th":"SUV 7 ที่นั่ง","name_en":"7-seat SUV","seats":6,"luggage":4},
       "van":         {"name_th":"รถตู้","name_en":"Van","seats_label":"9–13","seats":13,"luggage":6},
       "van_vip":     {"name_th":"รถตู้ VIP","name_en":"VIP van","seats_label":"9–10","seats":10,"luggage":8},
       "mpv_premium": {"name_th":"MPV พรีเมียม","name_en":"Premium MPV","seats":6,"luggage":4},
       "driver_only": {"name_th":"คนขับอย่างเดียว","name_en":"Driver only","desc_th":"ขับรถของคุณ","desc_en":"Drives your car"}
     },
     "order": ["sedan","suv","van_vip","driver_only"]
   }');

-- ราคาตัวอย่าง (สตางค์) — base = "เริ่ม" ในแคตตาล็อก
insert into price_rules (car_type, service_type, base_satang, included_km, per_km_satang, included_minutes,
                         ot_per_hour_satang, wait_per_hour_satang, free_wait_minutes, floor_satang, tax_category) values
  ('sedan',       'airport_transfer',  80000, 40, 1200,  180, 20000, 20000, 30,  70000, 'transport'),
  ('suv',         'airport_transfer', 120000, 40, 1500,  180, 25000, 25000, 30, 105000, 'transport'),
  ('van_vip',     'airport_transfer', 150000, 40, 1800,  180, 30000, 30000, 30, 130000, 'transport'),
  ('driver_only', 'airport_transfer',  50000, 40,  800,  180, 15000, 15000, 30,  45000, 'service'),
  ('sedan',       'daily_charter',    250000, 250,1200,  600, 25000, 25000, 30, 220000, 'rental'),
  ('suv',         'daily_charter',    320000, 250,1500,  600, 30000, 30000, 30, 290000, 'rental'),
  ('van_vip',     'daily_charter',    380000, 250,1800,  600, 35000, 35000, 30, 340000, 'rental'),
  ('driver_only', 'daily_charter',    150000, 0,     0,  600, 15000, 15000, 30, 130000, 'service'),
  ('sedan',       'point_to_point',   150000, 100,1000,  360, 20000, 20000, 30, 130000, 'transport'),
  ('suv',         'point_to_point',   200000, 100,1300,  360, 25000, 25000, 30, 180000, 'transport'),
  ('van_vip',     'point_to_point',   250000, 100,1600,  360, 30000, 30000, 30, 220000, 'transport'),
  ('driver_only', 'point_to_point',   100000, 100, 500,  360, 15000, 15000, 30,  90000, 'service'),
  ('sedan',       'hourly_charter',   150000, 100,1200,  300, 25000, 25000, 30, 130000, 'rental'),
  ('suv',         'hourly_charter',   200000, 100,1500,  300, 30000, 30000, 30, 180000, 'rental'),
  ('van_vip',     'hourly_charter',   250000, 100,1800,  300, 35000, 35000, 30, 220000, 'rental'),
  ('driver_only', 'hourly_charter',    80000,   0,   0,  300, 15000, 15000, 30,  70000, 'service');
