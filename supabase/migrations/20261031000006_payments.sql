-- เฟส 4 (S4) เงิน: FR-BOOK-03/06, FR-PAY-01..06

-- FR-BOOK-06 / FR-PAY-05: ผลการยกเลิก (คำนวณใน domain/cancellation.ts เก็บไว้ตรวจย้อน + ใช้ทำ payout เฟส 6)
alter table bookings add column refund_satang       bigint check (refund_satang >= 0);
alter table bookings add column driver_share_satang bigint check (driver_share_satang >= 0);
alter table bookings add column cancel_rule         text;

-- payments: เหตุผลที่ตรวจไม่ผ่าน · อายุ QR · หลักฐานโอนคืน · ใครขอให้อนุมัติ
alter table payments add column reason          text;
alter table payments add column expires_at      timestamptz;
alter table payments add column proof_file_path text;
alter table payments add column requested_by    uuid references users(id);
alter table payments add column refunded_at     timestamptz;
-- คืนเงิน "โอนแล้ว" ต้องมีหลักฐาน
alter table payments add constraint refund_paid_has_proof
  check (kind <> 'refund' or status <> 'refunded' or (proof_file_path is not null and refunded_at is not null));
-- มัดจำ/ยอดคงเหลือ ค้างได้ทีละรายการต่องาน
create unique index one_open_payment_per_kind on payments (booking_id, kind)
  where status in ('pending','pending_approval') and kind in ('deposit','balance');

-- BR-PAY-01 (P2): ยืนยันงานได้เมื่อยอดมัดจำที่ verified ≥ deposit_satang — บังคับที่ฐานข้อมูลด้วย
create or replace function bookings_deposit_guard() returns trigger language plpgsql as $$
begin
  if new.status = 'confirmed' and old.status = 'awaiting_deposit'
     and coalesce((select sum(amount_satang) from payments
                    where booking_id = new.id and kind = 'deposit' and status = 'verified'), 0) < new.deposit_satang then
    raise exception 'DEPOSIT_NOT_VERIFIED' using errcode = 'DT422';
  end if;
  return new;
end $$;
create trigger bookings_30_deposit_guard before update of status on bookings
  for each row execute function bookings_deposit_guard();

-- ใบเสร็จ: แก้/ลบไม่ได้ (เลขที่ต่อเนื่อง ไม่ข้าม ไม่ซ้ำ — FR-PAY-06)
create or replace function receipts_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' or new.number <> old.number or new.amount_satang <> old.amount_satang or new.payment_id <> old.payment_id then
    raise exception 'RECEIPT_IMMUTABLE' using errcode = 'DT409';
  end if;
  return new;
end $$;
create trigger receipts_immutable before update or delete on receipts
  for each row execute function receipts_immutable();
create trigger receipts_audit after insert or update on receipts for each row execute function audit_row();
-- ใบเสร็จออกได้เฉพาะเงินที่ verified และไม่ใช่การคืนเงิน
create or replace function receipts_payment_guard() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from payments where id = new.payment_id and status = 'verified' and kind <> 'refund') then
    raise exception 'RECEIPT_REQUIRES_VERIFIED_PAYMENT' using errcode = 'DT422';
  end if;
  return new;
end $$;
create trigger receipts_payment_guard before insert on receipts for each row execute function receipts_payment_guard();

-- §2.2: sales_admin อ่านใบเสร็จได้ (ตาราง 2.2 ใน Req ให้ R รายงาน) — ลูกค้าเห็นของตัวเอง
drop policy receipts_read on receipts;
create policy receipts_read on receipts for select using (
  is_staff()
  or payment_id in (select p.id from payments p join bookings b on b.id = p.booking_id where b.customer_id = app_user_id()));

-- consents: ผู้ใช้อ่านของตัวเองได้อยู่แล้ว (consents_read) — ไม่ต้องเพิ่ม
