# แพลตฟอร์มทีมคนขับรถ

สร้างตาม `11 System Design - แพลตฟอร์มทีมคนขับรถ.md` (v1.0) · UI ตาม mockup "A · ไว้ใจได้ (แคตตาล็อกรถ)"
Next.js 16 (App Router) + TypeScript + Tailwind 4 · Supabase (Postgres + RLS) · Vitest + pgTAP

## เริ่มบนเครื่อง

ต้องมี Node 24 และ Docker Desktop ที่เปิดอยู่

```bash
npm install
npx supabase start          # Postgres/Auth/Storage local
npm run setup:env           # สร้าง .env.local (secrets สุ่ม + ค่า Supabase local)
npm run db:reset            # migration + seed
npm run seed:dev            # ผู้ใช้ทดสอบ
npm run dev                 # http://localhost:3000
```

| หน้า | URL | เข้าสู่ระบบ |
|---|---|---|
| แคตตาล็อก | `/` | ไม่ต้อง |
| ลูกค้า (LIFF) | `/liff/customer` | LINE · บน local ใช้ `/dev/login` |
| คนขับ (LIFF) | `/liff/driver` | LINE (ต้องถูกเชิญ) · บน local ใช้ `/dev/login` |
| หลังบ้าน | `/admin` | `owner@example.test` / `sales@example.test` · รหัสผ่าน = `DEV_SEED_PASSWORD` ใน `.env.local` |

## ทดสอบ

```bash
npm run lint && npm run typecheck && npm test   # unit (Vitest)
npm run test:db                                 # pgTAP: RLS, audit, state machine, eligibility
npm run seed:demo && npm run test:e2e           # E2E (Playwright, มือถือ Pixel 7) — เปิด npm run dev ไว้หรือให้ Playwright เปิดเอง
```

Load test (k6 ผ่าน Docker, ยิงกับ production build):

```bash
npm run build && npx next start -p 3001
docker run --rm -i -e BASE=http://host.docker.internal:3001 -e EMAIL=owner@example.test -e PASSWORD=<DEV_SEED_PASSWORD> grafana/k6:0.54.0 run - < tests/load/k6.js
```

คู่มือ: [เจ้าของ/แอดมิน](docs/คู่มือเจ้าของ.md) · [คนขับ](docs/คู่มือคนขับ.md) · [go-live checklist](docs/go-live.md)

## โครงสร้าง

```
src/app/(public)        แคตตาล็อก
src/app/liff/*          หน้า LIFF ลูกค้า/คนขับ
src/app/admin/*         หลังบ้าน
src/app/api/*           Route Handlers (กฎธุรกิจฝั่งเซิร์ฟเวอร์)
src/domain/*            กฎธุรกิจล้วน ไม่มี I/O (ห้าม import services/adapters/lib/db)
src/services/*          orchestration + DB
src/adapters/*          LINE, payments, maps, ads
src/lib/*               db, auth, crypto, redact, errors, idempotency, money, time
supabase/migrations     schema · triggers · RLS
supabase/tests          pgTAP
tests/unit              Vitest
```

## ความต่างจากเอกสารออกแบบ (ตั้งใจ)

- โค้ดแอปอยู่ใต้ `src/app` (ไม่ใช่ `/app` ที่ราก) ตาม convention ของ Next.js เมื่อมี `src/`
- ตัดคอลัมน์ `*_enc` / `phone_hash` ด้วย **column privilege** แทน view — `select *` จาก client ล้มเหลวทันที ไม่ต้องพึ่งการเลือก view ให้ถูก
- เซิร์ฟเวอร์อ่านข้อมูลในนามผู้ใช้ด้วย `asUser()` (ตั้ง `role authenticated` + JWT claims ใน transaction) → RLS บังคับจริงแม้ผู้ใช้ LIFF ไม่มีบัญชี Supabase Auth
- trigger ตั้งชื่อ `bookings_10_status_guard` / `bookings_20_assignment_guard` เพราะ Postgres รัน BEFORE trigger ตามลำดับชื่อ
- ปิด Cache Components ของ Next.js 16 — แทบทุกหน้าอ่านข้อมูลต่อผู้ใช้ตอน request

### เฟส 2 (คนขับ/รถ)

- ตารางเทคนิคเพิ่ม `driver_invites` (ลิงก์เชิญครั้งเดียว 72 ชม. เก็บแค่ hash ของ token) → รวม 35 ตาราง
- `documents` เพิ่ม `data` / `data_enc` / `uploaded_by`: คนขับส่ง "ข้อมูล + ไฟล์" แล้วระบบคัดลอกเข้า `drivers`/`vehicles` **ตอน owner อนุมัติเท่านั้น** — คนขับแก้วันหมดอายุเองไม่ได้
- `kyc_status` คำนวณจากเอกสาร (`refresh_kyc`): ทุกประเภทที่ต้องมี (⚙️ `compliance.required_docs`) มีฉบับที่ผ่าน → approved · ส่งฉบับต่ออายุแล้วรอตรวจไม่ทำให้หลุด
- BR-COMP-02 ต้องมีทั้งสัญญาและ PDPA consent (ใช้รายการล่าสุด → ถอนความยินยอมแล้วหลุดทันที) — SQL ในเอกสารออกแบบตรวจแค่สัญญา
- `consents.meta` เก็บ IP / LINE ID ตอนยอมรับ (FR-DRV-04)
- ปฏิทิน: `POST /api/me/availability` + `DELETE /api/me/availability/{id}` แทน `PUT` ก้อนเดียว
- sales_admin ไม่เห็นไฟล์/ข้อมูลเอกสาร KYC เลย (ตาม §5.2 ของเอกสารออกแบบ) แต่เห็นสถานะ kyc และเหตุผล eligibility
- รายการประเภททะเบียน/ใบขับขี่ (`registration_types`, `license_classes` ใน settings) เป็นร่าง ❓ รอยืนยันกับ ขบ.

### เฟส 3 (ราคา/ใบเสนอราคา)

- `npm run seed:demo` (local เท่านั้น) สร้างคนขับ+รถ 3 คันที่รับงานได้ และตั้ง `allowed_registrations` / `license_coverage` / `bg_check_valid_years` เป็น**ค่าสาธิต** — เพราะแคตตาล็อกแสดงเฉพาะประเภทที่มีรถพร้อม (FR-CAT-01)
- **ตำแหน่งไม่ใช้ API แผนที่ที่มีค่าใช้จ่าย**: ลูกค้าระบุเองด้วย GPS มือถือ / ปักหมุดบนแผนที่ OpenStreetMap (Leaflet) / วางลิงก์หรือพิกัดจาก Google Maps (เซิร์ฟเวอร์ตามลิงก์ย่อ maps.app.goo.gl เพื่อหาพิกัด) · ระยะทาง = ระยะเส้นตรงผ่านทุกจุด × `route_estimate.road_factor` (1.35) · เวลา = ระยะ ÷ `avg_kmh` (50) → `distance_source = estimate` · แอดมินกรอกระยะเองได้ (`manual`) · คนขับนำทางด้วยปุ่ม Google Maps / Waze จากพิกัด
- สนามบินกำหนดใน settings `airports` (ใช้ lat/lng) — ตรวจพิกัดให้ตรงอาคารผู้โดยสาร
- ตารางเทคนิคเพิ่ม `route_cache` (cache ระยะ 7 วัน) → รวม 36 ตาราง · `quotes` เพิ่ม `notes`, `hours`, `discount_requested_by`, `reminded_at`
- แก้ราคา = ปิดกฎเดิม + เพิ่มกฎใหม่ (exclusion constraint กันกฎซ้อน) → ใบเสนอราคาเดิมยังอ้างราคาเดิม · ใบเสนอราคาที่ส่งแล้วแก้ราคาทับไม่ได้ (trigger)
- ส่วนลดเกินเพดานของแอดมิน = ออก revision ใหม่สถานะ `pending_approval` ฉบับเดิมยังใช้ได้จนเจ้าของอนุมัติ
- "PDF" ใบเสนอราคา = หน้าพิมพ์ของเบราว์เซอร์ (บันทึกเป็น PDF ได้) — ฟอนต์ไทยแสดงถูกกว่าสร้าง PDF ฝั่งเซิร์ฟเวอร์
- `POST /api/webhooks/line` (ตรวจลายเซ็น): follow/message → สร้างบัญชีลูกค้าจาก LINE user id ให้แอดมินออกใบเสนอราคาแทนได้
- ค่าที่นั่งเด็ก/จุดแวะ (`extras`) และชั่วโมงเหมา (`charter_hours`) เป็นค่าตัวอย่างใน settings

### เฟส 4 (เงิน)

- `settings.payment_adapter` = `slip` (ค่าเริ่ม) หรือ `gateway` (Omise) — ❓ T3 รอผล pilot
  - **slip**: QR พร้อมเพย์ของบริษัทพร้อมยอด (สร้างเองตามมาตรฐาน EMVCo) · ตรวจสลิปตามกฎ BR-PAY-01 ใน `domain/slip.ts`
    · **ยังไม่ได้ต่อผู้ให้บริการ API ตรวจสลิป** → ทุกสลิปไปรอตรวจด้วยมือ (แอดมินขอ → เจ้าของอนุมัติ) · บน local มีปุ่ม "[local] จำลองสลิป"
  - **gateway**: Omise PromptPay charge + webhook ที่ดึง charge ยืนยันเอง — **ยังไม่ได้ทดสอบกับบัญชี Omise จริง** (T4)
- ข้อมูลบริษัท/พร้อมเพย์ใน settings `company` เป็นค่าตัวอย่าง — ต้องเป็นบัญชีบริษัทเท่านั้น (BR-PAY-04)
- ตอนยืนยันการจอง ลูกค้ากรอกชื่อ-เบอร์ (เข้ารหัส) — LINE ไม่ให้เบอร์ แต่คนขับต้องใช้ติดต่อ (§5.3)
- ฐานข้อมูลบังคับเอง: ยืนยันงานต้องมีมัดจำ verified ครบ · ใบเสร็จออกได้เฉพาะเงินที่ verified และแก้/ลบไม่ได้ · คืนเงิน "โอนแล้ว" ต้องมีหลักฐาน · รายการรับเงินค้างได้ทีละรายการ
- ส่งสลิปที่ `POST /api/payments/{payment_id}/slip` (ไม่ใช่ booking id) เพื่อรองรับทั้งมัดจำและยอดคงเหลือ
- `bookings` เพิ่ม `refund_satang`, `driver_share_satang`, `cancel_rule` (ใช้ทำ payout เฟส 6) · `payments` เพิ่ม `reason`, `expires_at`, `proof_file_path`, `requested_by`, `refunded_at`
- ใบเสร็จ = หน้าพิมพ์/บันทึก PDF · ใบกำกับภาษี (FR-PAY-07) ปิดไว้จนจด VAT
- ยังไม่บล็อกการเริ่มงานเมื่อยอดคงเหลือยังไม่จ่าย (T10) — ทำพร้อมสถานะวันงานในเฟส 5

### เฟส 5 (จ่ายงาน/วันงาน)

- ผู้มีสิทธิ์รับงานคำนวณใน SQL (`assignment_problems`, `dispatch_candidates`) = คนขับ+รถผ่านเกณฑ์ ณ วันงาน + ว่างตามปฏิทินและงานอื่น (เผื่อ `buffer_minutes`) · ลำดับคิวใน `domain/dispatch.ts`
- **ประกาศงานถึงคนขับทุกคนที่ผ่านเกณฑ์พร้อมกัน** ทันทีที่มัดจำยืนยัน (migration 0012: offer ค้างได้หลายใบต่องาน คนละคนขับ) · ใครกดรับก่อนได้งาน — ล็อกแถว booking ก่อน offer จึงรับพร้อมกันได้คนเดียว · ข้อเสนอที่เหลือ = `taken` + LINE แจ้ง "มีคนรับแล้ว" · หน้าคนขับแสดง "ปิดงานแล้ว" เมื่องาน completed (ไม่ส่ง LINE) · หมดเวลา/ปฏิเสธครบทุกคน → แจ้ง owner + sales · คนขับยกเลิก/เจ้าของสั่งเสนอใหม่ → ประกาศอีกรอบรวมคนที่เคยได้ข้อเสนอ (ยกเว้นคนที่ยกเลิก)
- ปุ่มรับ/ปฏิเสธใน Flex Message ทำงานผ่าน LINE postback ที่ `/api/webhooks/line` (ตอบด้วย reply ทันที ไม่ผ่าน outbox เพราะ reply token อายุสั้น)
- override ของ owner เลือกได้เฉพาะคนที่ผ่านเกณฑ์และว่าง (BR-COMP-03) และต้องมีเหตุผล
- check-in บังคับ GPS ทุกขั้น + รูปตอนรับ/ส่ง · ห่างจุดนัด > `far_from_target_m` → ผ่านได้แต่เตือน + แจ้ง owner · check-in และ contact_reveals แก้/ลบไม่ได้
- ยอดคงเหลือยังไม่จ่ายตอนออกเดินทาง: ค่าเริ่ม **แจ้ง owner** — ตั้ง `block_start_if_unpaid = true` เพื่อบล็อก (❓ T10)
- no-show: คนขับรายงานพร้อมรูป → owner ยืนยันหลังเลยเวลารอฟรี → คำนวณส่วนคนขับ + ค่ารอ (ไม่เกินยอดที่ลูกค้าจ่าย)
- ค่ารอบันทึกเป็นนาทีใน `bookings.wait_minutes` — การเก็บเงินค่ารอ (FR-PAY-09) เป็นงานเฟส 2 ของ Req
- AC-7.1: ความพยายามเปลี่ยนสถานะที่ไม่ผ่านบันทึก `TRANSITION_REJECTED` ใน audit_logs · ขอเบอร์ลูกค้านอกเวลาบันทึก `CONTACT_DENIED`
- ยังไม่ทำ: คะแนนคนขับอัตโนมัติ (BR-FRAUD-04 ❓ หลัง pilot), strike/ค่าปรับ (`penalties_enabled` ปิด), ติดตามรถสด (FR-BOOK-05), แชท relay (FR-FRAUD-02), payout (เฟส 6)

### เฟส 6 (payout / หลังบ้าน / แอด)

- payout = ค่างานที่ลูกค้าจ่ายจริง − ค่าคอม − หัก ณ ที่จ่าย − ค่าปรับ (ปิด) + เบิกคืน · ยอดต่องานเก็บใน `payout_items` และฐานข้อมูลบังคับให้ยอดรวมตรงกับรายการ · โอนแล้วแก้ไม่ได้
  - ❓ `withholding.rate` / `withholding.base` (T2) ยังว่าง → คิด 0 และเตือนในหลังบ้าน · `commission_on_cancellation` (T9) ค่าเริ่ม false
  - ปล่อยเงิน: งาน completed (ลูกค้ายืนยัน หรือ auto 24 ชม.) ที่ไม่มีร้องเรียนเปิด + ส่วนแบ่งจากงานยกเลิก/no-show
- กล่องงานวันนี้ (`/admin`) รวมทุกเรื่องที่ต้องทำ · บล็อก/ระงับผู้ใช้มีผลทันที · export CSV (UTF-8 BOM, ไม่มีชื่อ/เบอร์ลูกค้า)
- แอด: `/go/{slug}` → landing `/l/{service}` (ไทย/EN) → แบนเนอร์คุกกี้ → touchpoint → `?t=` → ผูกกับผู้ใช้หลัง login → quote (first/last touch) → booking (`source_platform` + `campaign_id`, ไม่มีค่าว่าง)
  - ไม่ยินยอมคุกกี้ = นับคลิกแคมเปญอย่างเดียว ไม่เก็บ click id ไม่ผูกคน (บังคับด้วย constraint) · Meta Pixel โหลดหลังยินยอมเท่านั้น (ตั้ง `NEXT_PUBLIC_META_PIXEL_ID`)
  - landing เผยแพร่ได้หลังเจ้าของติ๊กเช็กลิสต์ FR-ADS-17 ครบ · ไม่โฆษณา "ติดตามรถสด" เพราะ FR-BOOK-05 ยังไม่ทำ
- ยังไม่ทำ (เฟส 2–3 ของ Req): ส่ง conversion กลับ Meta/Google (FR-ADS-07/08), แจ้งเตือนต้นทุนแอด > 15% อัตโนมัติ (FR-ADS-06), กันยิงแอดตอนรถเต็ม (FR-ADS-11), หนังสือรับรองหัก ณ ที่จ่าย (FR-PAYOUT-05), คำขอสิทธิ์เจ้าของข้อมูล/retention (FR-PDPA-02/03)

| งานอัตโนมัติ | endpoint | หมายเหตุ |
|---|---|---|
| outbox_worker | `POST /api/jobs/outbox` | ทุก 30–60 วิ |
| doc_expiry | `POST /api/jobs/doc-expiry` | ทุกวัน 08:00 · นอก production ส่ง `{"today":"YYYY-MM-DD"}` จำลองวันได้ |
| expire_quotes | `POST /api/jobs/expire-quotes` | ทุก 5 นาที · หมดอายุ + เตือน 2 ชม. ก่อนหมด |
| expire_unpaid | `POST /api/jobs/expire-unpaid` | ทุก 5 นาที · เกิน `deposit_window_minutes` → expired (ยกเว้นสลิปที่รอตรวจ) |
| expire_offers | `POST /api/jobs/expire-offers` | ทุก 1 นาที · หมดเวลา → เสนอคนถัดไป |
| auto_complete | `POST /api/jobs/auto-complete` | ทุก 15 นาที · ส่งแล้ว ≥ 24 ชม. ไม่มีร้องเรียน → completed |
| reminders | `POST /api/jobs/reminders` | ทุก 15 นาที · วันก่อนงาน 18:00 และ 2 ชม. ก่อน |
| future_job_guard | `POST /api/jobs/future-job-guard` | ทุกวัน 08:00 · คนขับ/รถจะไม่ผ่านเกณฑ์ ณ วันงาน → แจ้ง owner |
| payout_build | `POST /api/jobs/payout-build` | ทุกวัน · งานที่ปล่อยเงินได้ → payout รอโอน |

| cleanup | `POST /api/jobs/cleanup` | ทุกวัน · ลบ idempotency key > 24 ชม., rate limit, route cache เก่า, job_runs > 30 วัน |
| audit_export | `POST /api/jobs/audit-export` | ทุกวัน · audit ของเมื่อวาน → JSONL ใน bucket `audit-exports` |

ทั้งหมดต้องส่ง `Authorization: Bearer $CRON_SECRET` · ทุกการรันบันทึกใน `job_runs` ดูได้ที่ `/admin/system` · รอบเวลาแนะนำใน [docs/go-live.md](docs/go-live.md)

### เฟส 7 (hardening / UAT)

- **ความปลอดภัย**: security headers + CSP (`next.config.ts`) · CSRF ตรวจ Origin ทุก API ที่เขียนข้อมูล (`src/proxy.ts`, ยกเว้น webhook/jobs) · rate limit ใน Postgres (`rate_hit`): admin login 10 ครั้ง/15 นาที ต่อ IP และต่ออีเมล, LIFF login 30/นาที, touchpoint/คุกกี้/`/go` 60/นาที · login จากเครื่องใหม่ → แจ้งเจ้าของทาง LINE · ไฟล์อัปโหลดตรวจ magic bytes ต้องตรง content-type · ตรวจ SQL ที่ต่อสตริงทั้งหมดแล้ว (เป็นค่าคงที่ในโค้ด/allow-list)
- **degraded mode**: `MAINTENANCE_MODE=true` → หน้า `/maintenance` (503, ไม่แตะ DB) + ปุ่ม LINE OA · `/api/health` รายงาน DB/outbox/worker · หน้า `/admin/system` ดูงานอัตโนมัติที่ค้างและส่งข้อความ LINE ที่ล้มเหลวใหม่
- **ประสิทธิภาพ**: settings/catalog cache ในโปรเซส (10–15 วิ, ล้างทันทีเมื่อแก้) · กล่องงานวันนี้รวมเป็น query เดียว · session lookup ใช้ React `cache`
- **Load test** (local, production build, เครื่องเดียว): `MODE=realistic` 50 ผู้ใช้ คิด 2–5 วิ/หน้า → p95 รวม 70 ms (catalog 42, inbox 91, bookings 177), error 0% ✅ NFR-03 · `MODE=stress` (~85 req/s) → p95 0.5–1 วิ เพราะ Node โปรเซสเดียวบน laptop เต็ม CPU — บน Vercel แต่ละ request แยก instance ควรวัดซ้ำบน staging
- **E2E** (`tests/e2e`, 6 เคสตาม §15): จองผ่าน UI + สลิป + ใบเสร็จ · เสนองาน/วันงาน 4 ขั้น/payout · ยกเลิกคืนเงิน · เอกสารหมดอายุไม่ได้งาน · ส่วนลด > 10% ต้องอนุมัติ · แคมเปญ → source ในการจอง + ไม่มีคำขอแอดก่อนยินยอม · CI รันทุก PR
- **ย้ายข้อมูล Pilot**: `npm run import:pilot -- <โฟลเดอร์ CSV> [--apply]` — dry-run ตรวจทุกแถวก่อน, apply ใน transaction เดียว · คนขับ → บัญชีรอเชิญ (ต้องยอมรับสัญญา/ส่งเอกสารใหม่), รถ → kyc pending, งาน done → ประวัติ (ไม่ย้ายชื่อ/เบอร์ลูกค้า ไม่ออกใบเสร็จย้อนหลัง), ค่าแอด → `ad_spend` · ตัวอย่างไฟล์ `tests/fixtures/pilot/`
- ยังไม่ทำ / ต้องตัดสินใจ: 2FA เจ้าของ (T7) · ข้อความหลายภาษา (NFR-10) ทำแค่ landing · ตรวจ a11y ครบทุกหน้า (NFR-11) · audit export ไป storage แบบเขียนครั้งเดียวภายนอก
