-- System Design §5 · RLS ทุกตาราง
-- การเขียนที่มีกฎธุรกิจทำผ่าน API ฝั่งเซิร์ฟเวอร์เท่านั้น → client (anon/authenticated) ไม่มีสิทธิ์เขียนเลย
-- คอลัมน์ *_enc / *_hash ถูกตัดด้วย column privilege (แทน view) → แม้ select * ก็อ่านไม่ได้

create or replace function app_user_id() returns uuid
language sql stable security definer set search_path = public as
  $$ select id from users where auth_user_id = auth.uid() $$;

create or replace function app_role() returns user_role
language sql stable security definer set search_path = public as
  $$ select role from users where auth_user_id = auth.uid() and status = 'active' $$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as
  $$ select coalesce(app_role() in ('sales_admin','owner'), false) $$;

-- ───────────── สิทธิ์ระดับตาราง ─────────────
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on %I from authenticated', t);
  end loop;
end $$;

-- คอลัมน์อ่อนไหว: ให้อ่านเฉพาะคอลัมน์ที่ปลอดภัย
revoke select on users from authenticated;
grant select (id, role, status, display_name, locale, created_at) on users to authenticated;
revoke select on drivers from authenticated;
grant select (user_id, public_license_class, public_license_expiry, background_check_at, background_check_passed,
              bank_account_last4, kyc_status, score, strikes, deposit_balance_satang, last_assigned_at, created_at)
  on drivers to authenticated;

-- แคตตาล็อกเปิดให้ทุกคนอ่าน
grant select on price_rules to anon;

-- ───────────── Policies (อ่านอย่างเดียว) ─────────────
create policy users_read on users for select using (id = app_user_id() or is_staff());
create policy drivers_read on drivers for select using (user_id = app_user_id() or is_staff());
create policy vehicles_read on vehicles for select using (driver_id = app_user_id() or is_staff());

-- sales_admin ไม่เห็นเอกสาร KYC (ตาราง 2.2 ใน Req)
create policy docs_read on documents for select using (
  app_role() = 'owner'
  or (owner_type = 'driver'  and owner_id = app_user_id())
  or (owner_type = 'vehicle' and owner_id in (select id from vehicles where driver_id = app_user_id())));

create policy allowed_reg_read on allowed_registrations for select using (is_staff());
create policy license_cov_read on license_coverage for select using (is_staff());
create policy availability_read on availability for select using (driver_id = app_user_id() or is_staff());

create policy price_rules_read on price_rules for select to anon, authenticated using (true);

create policy quotes_read on quotes for select using (customer_id = app_user_id() or is_staff());
create policy bookings_read on bookings for select using (
  customer_id = app_user_id() or driver_id = app_user_id() or is_staff());
create policy transitions_read on booking_transitions for select to authenticated using (true);
create policy offers_read on job_offers for select using (driver_id = app_user_id() or is_staff());

create policy payments_read on payments for select using (
  is_staff() or booking_id in (select id from bookings where customer_id = app_user_id()));
create policy payouts_read on payouts for select using (driver_id = app_user_id() or is_staff());
create policy payout_items_read on payout_items for select using (
  is_staff() or payout_id in (select id from payouts where driver_id = app_user_id()));
create policy receipts_read on receipts for select using (
  app_role() = 'owner'
  or payment_id in (select p.id from payments p join bookings b on b.id = p.booking_id
                    where b.customer_id = app_user_id()));

create policy checkins_read on checkins for select using (
  is_staff() or booking_id in (select id from bookings
                               where customer_id = app_user_id() or driver_id = app_user_id()));
create policy contact_reveals_read on contact_reveals for select using (app_role() = 'owner');
create policy reviews_read on reviews for select using (
  is_staff() or booking_id in (select id from bookings
                               where customer_id = app_user_id() or driver_id = app_user_id()));
create policy incidents_read on incidents for select using (reported_by = app_user_id() or is_staff());
create policy complaints_read on complaints for select using (customer_id = app_user_id() or is_staff());
create policy consents_read on consents for select using (user_id = app_user_id() or app_role() = 'owner');
create policy data_requests_read on data_requests for select using (user_id = app_user_id() or app_role() = 'owner');

create policy campaigns_read on campaigns for select using (is_staff());
create policy touchpoints_read on touchpoints for select using (is_staff());
create policy ad_spend_read on ad_spend for select using (is_staff());
create policy conversion_uploads_read on conversion_uploads for select using (is_staff());
create policy promo_codes_read on promo_codes for select using (is_staff());

create policy settings_read on settings for select using (is_staff());
create policy audit_read on audit_logs for select using (is_staff());
create policy partners_read on partners for select using (user_id = app_user_id() or app_role() = 'owner');
-- number_sequences, idempotency_keys, outbox: ไม่มี policy = client มองไม่เห็นเลย

-- ───────────── Storage buckets (§5.4) ─────────────
insert into storage.buckets (id, name, public) values
  ('kyc-docs', 'kyc-docs', false),
  ('checkins', 'checkins', false),
  ('receipts', 'receipts', false),
  ('public-assets', 'public-assets', true)
on conflict (id) do nothing;
-- อัปโหลด/อ่านไฟล์ private ทำผ่าน API (service role) + signed URL ≤ 10 นาที
