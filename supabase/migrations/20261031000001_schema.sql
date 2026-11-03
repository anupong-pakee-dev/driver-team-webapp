-- System Design §4.1–§4.2 · enums + 34 tables
-- เงินทุกช่อง = *_satang bigint · ข้อมูลอ่อนไหว = *_enc bytea (เข้ารหัสระดับแอป §13.3)

create extension if not exists btree_gist;   -- ใช้กับ exclusion constraint กันชนเวลา

-- ───────────────────────── 4.1 Enum ─────────────────────────
create type user_role       as enum ('customer','corporate_customer','driver','sales_admin','owner','partner');
create type user_status     as enum ('active','suspended','blocked');
create type service_type    as enum ('airport_transfer','point_to_point','hourly_charter','daily_charter','driver_only');
create type car_type        as enum ('sedan','suv','van','van_vip','mpv_premium','driver_only');
create type tax_category    as enum ('transport','rental','service');   -- ❓ นักบัญชียืนยันการจัดประเภท
create type kyc_status      as enum ('pending','approved','rejected');
create type doc_status      as enum ('pending','approved','rejected','expired');
create type quote_status    as enum ('draft','sent','pending_approval','accepted','expired','superseded','rejected');
create type booking_status  as enum ('awaiting_deposit','confirmed','assigned','en_route','arrived',
                                     'picked_up','dropped_off','completed','disputed','cancelled','no_show','expired');
create type offer_result    as enum ('pending','accepted','rejected','expired','withdrawn');
create type payment_kind    as enum ('deposit','balance','refund','reimbursement','wait_fee');
create type payment_method  as enum ('gateway','slip','manual');
create type payment_status  as enum ('pending','verified','pending_approval','failed','refunded');
create type payout_status   as enum ('held','ready','paid','cancelled');
create type checkin_kind    as enum ('depart','arrive','pickup','dropoff');
create type incident_type   as enum ('accident','breakdown','no_show','lost_item','safety','other');
create type case_status     as enum ('open','resolved','rejected');
create type consent_kind    as enum ('terms','privacy','driver_contract','vehicle_liability','marketing_photo','marketing_tracking');
create type ad_platform     as enum ('meta','google','tiktok','gbp','offline','referral','direct','unknown');
create type outbox_status   as enum ('pending','sent','failed','dead');

-- ───────────────────────── ผู้ใช้ คนขับ รถ เอกสาร ─────────────────────────
create table users (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid unique,                 -- supabase auth.users.id (แอดมิน) หรือ uuid ที่ระบบออกให้ (LIFF)
  role            user_role not null,
  status          user_status not null default 'active',
  line_user_id    text unique,
  display_name    text,
  full_name_enc   bytea,
  phone_enc       bytea,
  phone_hash      text,                        -- HMAC(E.164) ใช้ค้นหา/กันซ้ำ
  locale          text not null default 'th' check (locale in ('th','en')),
  created_at      timestamptz not null default now()
);
create index on users (phone_hash);

create table drivers (
  user_id                 uuid primary key references users(id),
  public_license_no_enc   bytea,
  public_license_class    text,                -- ❓ ค่าตามประเภทใบขับขี่ที่ ขบ. กำหนด
  public_license_expiry   date,
  background_check_at     date,
  background_check_passed boolean,
  bank_account_enc        bytea,
  bank_account_last4      text,
  kyc_status              kyc_status not null default 'pending',
  score                   int not null default 100,
  strikes                 int not null default 0,      -- ใช้เมื่อ penalties_enabled
  deposit_balance_satang  bigint not null default 0,   -- ใช้เมื่อ penalties_enabled
  last_assigned_at        timestamptz,                 -- คิวเวียน
  created_at              timestamptz not null default now()
);

create table vehicles (
  id                             uuid primary key default gen_random_uuid(),
  driver_id                      uuid not null references drivers(user_id),
  owner_name                     text,
  car_type                       car_type not null check (car_type <> 'driver_only'),
  plate                          text not null unique,
  seats                          int  not null check (seats between 1 and 15),
  luggage                        int  not null check (luggage >= 0),
  registration_type              text not null,       -- ต้องอยู่ใน allowed_registrations จึงจะรับงานได้
  tax_expiry                     date,
  inspection_due                 date,
  compulsory_insurance_expiry    date,
  voluntary_insurer              text,
  voluntary_policy_no            text,
  voluntary_insurance_usage      text check (voluntary_insurance_usage in ('commercial_hire','rental','public','private')),
  voluntary_insurance_expiry     date,
  insurance_claim_phone          text,
  passenger_insurance_sum_satang bigint,
  passenger_insurance_expiry     date,
  kyc_status                     kyc_status not null default 'pending',
  active                         boolean not null default true,
  created_at                     timestamptz not null default now()
);
create index on vehicles (driver_id);

create table documents (
  id            uuid primary key default gen_random_uuid(),
  owner_type    text not null check (owner_type in ('driver','vehicle')),
  owner_id      uuid not null,
  doc_type      text not null,   -- id_card, public_license, selfie_with_id, bank_book, registration_book,
                                 -- compulsory_ins, voluntary_ins, passenger_ins, tax_receipt, inspection, background_check
  file_path     text not null,   -- path ใน bucket kyc-docs
  status        doc_status not null default 'pending',
  expires_at    date,
  reviewed_by   uuid references users(id),
  reviewed_at   timestamptz,
  reject_reason text,
  created_at    timestamptz not null default now()
);
create index on documents (owner_type, owner_id, doc_type);
create index on documents (expires_at) where status = 'approved';

-- กรอกตามคำตอบ ขบ. เท่านั้น (BR-COMP-05) — ตารางว่าง = ไม่มีรถคันไหนรับงานได้
create table allowed_registrations (
  service_type        service_type not null,
  registration_type   text not null,
  note                text,
  confirmed_by_dlt_at date not null,
  primary key (service_type, registration_type)
);

-- ใบขับขี่ประเภทไหนขับรถประเภทไหนได้ (กรอกตาม ขบ.) ❓
create table license_coverage (
  license_class text not null,
  car_type      car_type not null,
  primary key (license_class, car_type)
);

create table availability (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null references drivers(user_id),
  vehicle_id  uuid references vehicles(id),
  period      tstzrange not null,
  kind        text not null check (kind in ('available','blocked')),
  exclude using gist (driver_id with =, period with &&) where (kind = 'blocked')
);

-- ───────────────────────── ราคา ใบเสนอราคา งาน ─────────────────────────
create table price_rules (
  id                   uuid primary key default gen_random_uuid(),
  car_type             car_type not null,
  service_type         service_type not null,
  base_satang          bigint not null check (base_satang >= 0),
  included_km          int    not null default 0,
  per_km_satang        bigint not null default 0,
  included_minutes     int    not null default 0,
  ot_per_hour_satang   bigint not null default 0,
  wait_per_hour_satang bigint not null default 0,
  free_wait_minutes    int    not null default 30,
  floor_satang         bigint not null,
  tax_category         tax_category not null,
  active_from          timestamptz not null default now(),
  active_to            timestamptz,
  check (floor_satang <= base_satang)
);
create index on price_rules (car_type, service_type, active_from desc);

create table quotes (
  id               uuid primary key default gen_random_uuid(),
  number           text not null,               -- Q-YYMM-NNNN
  revision         int  not null default 1,
  customer_id      uuid not null references users(id),
  created_by       uuid not null references users(id),
  service_type     service_type not null,
  car_type         car_type not null,
  origin           jsonb not null,              -- {place_id,name,lat,lng}
  stops            jsonb not null default '[]',
  destination      jsonb,
  pickup_at        timestamptz not null,
  return_at        timestamptz,
  pax              int not null check (pax > 0),
  luggage          int not null default 0,
  child_seats      int not null default 0,
  flight_no        text,
  airport          text check (airport in ('BKK','DMK')),
  flight_direction text check (flight_direction in ('arrival','departure')),
  no_flight        boolean not null default false,
  distance_m       int,
  duration_s       int,
  distance_source  text check (distance_source in ('routes_api','manual')),
  price_rule_id    uuid not null references price_rules(id),
  breakdown        jsonb not null,              -- ผลจาก domain/pricing.ts เก็บไว้ตรวจย้อน
  computed_satang  bigint not null,
  discount_satang  bigint not null default 0 check (discount_satang >= 0),
  discount_reason  text,
  promo_code       text,
  final_satang     bigint not null,
  tax_category     tax_category not null,
  status           quote_status not null default 'draft',
  expires_at       timestamptz not null,
  first_touch_id   uuid,
  last_touch_id    uuid,
  source_answer    text,                        -- "รู้จักเราจากไหน"
  created_at       timestamptz not null default now(),
  unique (number, revision),
  check (final_satang = computed_satang - discount_satang),
  check (service_type <> 'airport_transfer' or flight_no is not null or no_flight)   -- FR-BOOK-02
);
create index on quotes (customer_id, created_at desc);
create index on quotes (status, expires_at) where status in ('sent','pending_approval');

create table bookings (
  id                    uuid primary key default gen_random_uuid(),
  quote_id              uuid not null unique references quotes(id),
  customer_id           uuid not null references users(id),
  service_type          service_type not null,
  car_type              car_type not null,
  status                booking_status not null default 'awaiting_deposit',
  driver_id             uuid references drivers(user_id),
  backup_driver_id      uuid references drivers(user_id),
  vehicle_id            uuid references vehicles(id),
  preferred_driver_id   uuid references drivers(user_id),   -- ลูกค้าจองซ้ำขอคนเดิม (BR-DISP-03)
  pickup_at             timestamptz not null,
  est_end_at            timestamptz not null,                -- กันงานชนเวลา
  price_satang          bigint not null,
  deposit_satang        bigint not null check (deposit_satang > 0),
  balance_due           text not null default 'before_start' check (balance_due in ('before_start','after_end')),
  terms_version         text not null,
  terms_accepted_at     timestamptz not null,
  source_platform       ad_platform not null default 'unknown',
  campaign_id           uuid,
  first_touch_id        uuid,
  last_touch_id         uuid,
  wait_minutes          int not null default 0,
  customer_confirmed_at timestamptz,
  cancelled_by          text check (cancelled_by in ('customer','company','system')),
  cancel_reason         text,
  cancelled_at          timestamptz,
  created_at            timestamptz not null default now(),
  check (deposit_satang <= price_satang),
  check (est_end_at > pickup_at)
);
create index on bookings (status, pickup_at);
create index on bookings (driver_id, pickup_at);
create index on bookings (customer_id, created_at desc);

create table booking_transitions (            -- seed จาก src/domain/transitions.ts (§6.1)
  from_status booking_status not null,
  to_status   booking_status not null,
  primary key (from_status, to_status)
);

create table job_offers (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references bookings(id),
  driver_id       uuid not null references drivers(user_id),
  vehicle_id      uuid references vehicles(id),
  offered_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  result          offer_result not null default 'pending',
  reject_reason   text,
  is_override     boolean not null default false,
  override_reason text,
  check (not is_override or override_reason is not null)
);
create unique index one_pending_offer_per_booking on job_offers (booking_id) where result = 'pending';
create index on job_offers (expires_at) where result = 'pending';
create index on job_offers (driver_id, offered_at desc);

-- ───────────────────────── เงิน ─────────────────────────
create table payments (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references bookings(id),
  kind            payment_kind not null,
  method          payment_method not null,
  amount_satang   bigint not null check (amount_satang > 0),
  status          payment_status not null default 'pending',
  gateway_ref     text unique,                 -- Omise charge id
  slip_ref        text unique,                 -- เลขอ้างอิงจากสลิป (กันสลิปซ้ำ)
  slip_file_path  text,
  verified_by     uuid references users(id),
  approved_by     uuid references users(id),   -- manual ต้องเป็น owner (ตรวจใน API + trigger)
  raw             jsonb,                       -- response จาก gateway/slip API (ตัดข้อมูลอ่อนไหวออก)
  created_at      timestamptz not null default now(),
  check (method <> 'manual' or status <> 'verified' or approved_by is not null)
);
create index on payments (booking_id, kind, status);

create table payouts (
  id                 uuid primary key default gen_random_uuid(),
  driver_id          uuid not null references drivers(user_id),
  status             payout_status not null default 'held',
  gross_satang       bigint not null default 0,
  commission_satang  bigint not null default 0,
  penalties_satang   bigint not null default 0,
  withholding_satang bigint not null default 0,   -- ❓ อัตราจากนักบัญชี
  reimburse_satang   bigint not null default 0,
  net_satang         bigint generated always as
                     (gross_satang - commission_satang - penalties_satang - withholding_satang + reimburse_satang) stored,
  paid_at            timestamptz,
  proof_file_path    text,
  created_at         timestamptz not null default now(),
  check (status <> 'paid' or (paid_at is not null and proof_file_path is not null))
);
create index on payouts (driver_id, created_at desc);

create table payout_items (
  payout_id   uuid not null references payouts(id),
  booking_id  uuid not null unique references bookings(id),   -- งานหนึ่งจ่ายคนขับได้ครั้งเดียว
  primary key (payout_id, booking_id)
);

create table receipts (
  id             uuid primary key default gen_random_uuid(),
  number         text not null unique,          -- R-YYMM-NNNN ต่อเนื่อง ไม่ข้าม
  payment_id     uuid not null unique references payments(id),
  amount_satang  bigint not null,
  tax_category   tax_category not null,
  is_tax_invoice boolean not null default false, -- true ได้เมื่อ settings.vat_registered (FR-PAY-07)
  file_path      text,
  issued_at      timestamptz not null default now()
);

create table number_sequences (
  prefix text not null, period text not null, last int not null default 0,
  primary key (prefix, period)
);

-- ───────────────────────── ระหว่างงาน เคส PDPA ─────────────────────────
create table checkins (
  id                     uuid primary key default gen_random_uuid(),
  booking_id             uuid not null references bookings(id),
  kind                   checkin_kind not null,
  lat                    double precision not null,
  lng                    double precision not null,
  accuracy_m             int,
  distance_from_target_m int,
  photo_path             text,
  at                     timestamptz not null default now(),
  unique (booking_id, kind),
  check (kind not in ('pickup','dropoff') or photo_path is not null)   -- FR-TRIP-02
);

create table contact_reveals (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  driver_id  uuid not null references drivers(user_id),
  at         timestamptz not null default now()
);

create table reviews (
  booking_id        uuid primary key references bookings(id),
  rating            int not null check (rating between 1 and 5),
  comment           text,
  consent_marketing boolean not null default false,
  created_at        timestamptz not null default now()
);

create table incidents (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid references bookings(id),
  type        incident_type not null,
  reported_by uuid not null references users(id),
  description text not null,
  actions     text,
  status      case_status not null default 'open',
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz
);

create table complaints (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id),
  customer_id uuid not null references users(id),
  description text not null,
  resolution  text,
  status      case_status not null default 'open',
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz
);

create table consents (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid references users(id),
  anon_id  text,
  kind     consent_kind not null,
  version  text not null,
  granted  boolean not null,
  channel  text not null,
  at       timestamptz not null default now(),
  check (user_id is not null or anon_id is not null)
);
create index on consents (user_id, kind, at desc);

create table data_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id),
  kind         text not null check (kind in ('access','rectify','delete')),
  requested_at timestamptz not null default now(),
  due_at       timestamptz not null,
  done_at      timestamptz,
  note         text
);

-- ───────────────────────── โฆษณา ─────────────────────────
create table campaigns (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,                    -- /go/{slug}
  platform     ad_platform not null,
  name         text not null,
  utm_source   text, utm_medium text, utm_campaign text,
  service_type service_type,
  car_type     car_type,
  promo_code   text,
  start_at     date, end_at date,
  status       text not null default 'active'
);

create table touchpoints (
  id            uuid primary key default gen_random_uuid(),
  anon_id       text not null,                        -- id ก่อน login (หลังยินยอม ADS-10)
  user_id       uuid references users(id),            -- ผูกเมื่อ login LINE
  campaign_id   uuid references campaigns(id),
  utm_source    text, utm_medium text, utm_campaign text, utm_content text,
  click_id_type text check (click_id_type in ('gclid','fbclid','ttclid')),
  click_id      text,                                 -- เก็บตามตัวพิมพ์เดิม
  landing_url   text,
  at            timestamptz not null default now()
);
create index on touchpoints (user_id, at);
create index on touchpoints (anon_id, at);

create table ad_spend (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  platform      ad_platform not null,
  campaign_id   uuid references campaigns(id),
  amount_satang bigint not null,
  impressions   int, clicks int,
  entry         text not null default 'manual',
  unique (date, platform, campaign_id)
);

create table conversion_uploads (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid references bookings(id),
  quote_id     uuid references quotes(id),
  platform     ad_platform not null,
  event_name   text not null check (event_name in ('Lead','Purchase')),
  event_id     text not null unique,                -- กันนับซ้ำกับ Pixel
  value_satang bigint,
  status       outbox_status not null default 'pending',
  attempts     int not null default 0,
  sent_at      timestamptz,
  response     jsonb
);

create table promo_codes (                       -- เฟส 2
  code        text primary key,
  kind        text not null check (kind in ('percent','fixed')),
  value       int not null,
  campaign_id uuid references campaigns(id),
  valid_from  date, valid_to date, max_uses int,
  used        int not null default 0
);

-- ───────────────────────── ระบบ ─────────────────────────
create table settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table idempotency_keys (
  key        text primary key,
  user_id    uuid,
  route      text not null,
  response   jsonb,
  created_at timestamptz not null default now()
);

create table outbox (
  id              uuid primary key default gen_random_uuid(),
  topic           text not null,                          -- line.push / line.reply / meta.capi / google.dm
  payload         jsonb not null,
  dedupe_key      text unique,
  status          outbox_status not null default 'pending',
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  created_at      timestamptz not null default now()
);
create index on outbox (status, next_attempt_at);

create table audit_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  actor_role text,
  action     text not null,
  entity     text not null,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  reason     text,
  at         timestamptz not null default now()
);
create index on audit_logs (entity, entity_id, at desc);

create table partners (                           -- เฟส 3 (partners_enabled)
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id),
  commission_rate   numeric(5,4) not null,
  agreement_version text,
  status            text not null default 'inactive'
);
