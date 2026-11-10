-- เปลี่ยนการเสนองานจาก "ทีละคนตามคิว" เป็น "ประกาศถึงคนขับทุกคนที่ผ่านเกณฑ์ · ใครรับก่อนได้งาน"
-- งานหนึ่งมี offer ค้างได้หลายใบ (คนละคนขับ) · คนที่เหลือเมื่อมีคนรับแล้ว = result 'taken'

alter type offer_result add value if not exists 'taken';   -- มีคนขับคนอื่นรับงานนี้ไปแล้ว (ต่างจาก withdrawn = เจ้าของยกเลิก/มอบให้เอง)

drop index if exists one_pending_offer_per_booking;
create unique index one_pending_offer_per_driver on job_offers (booking_id, driver_id) where result = 'pending';
create index job_offers_pending_booking on job_offers (booking_id) where result = 'pending';
