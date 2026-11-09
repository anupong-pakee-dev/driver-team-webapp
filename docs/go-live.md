# Go-live checklist

ทำตามลำดับ · ✋ = ต้องได้คำตอบจากคนนอก (ขบ./ทนาย/นักบัญชี) ก่อน · ทุกข้อทำบน **staging ก่อน 1 รอบ** แล้วค่อย production

## 1. บัญชีและ secrets (S0)

| ระบบ | ต้องมี | env |
|---|---|---|
| Supabase (Singapore) | project production + staging แยกกัน | `DATABASE_URL` (pooler, transaction mode) · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` · `SUPABASE_SERVICE_ROLE_KEY` |
| Vercel | project ผูก repo, region `sin1` | — |
| LINE | Messaging API channel (OA) + LINE Login channel + LIFF 2 แอป (ลูกค้า `/liff/customer`, คนขับ `/liff/driver`) · webhook `https://<โดเมน>/api/webhooks/line` | `LINE_CHANNEL_SECRET` · `LINE_CHANNEL_ACCESS_TOKEN` · `LINE_LOGIN_CHANNEL_ID` · `NEXT_PUBLIC_LIFF_ID_CUSTOMER` · `NEXT_PUBLIC_LIFF_ID_DRIVER` · `NEXT_PUBLIC_LINE_OA_URL` |
| Omise (ถ้าใช้) | live key + webhook `/api/webhooks/omise` | `OMISE_SECRET_KEY` |
| Meta Pixel (ถ้าใช้) | pixel id | `NEXT_PUBLIC_META_PIXEL_ID` |
| แอป | สุ่มใหม่ทุกค่า (`openssl rand -base64 32`) **ห้ามใช้ค่าจาก local** | `SESSION_SECRET` · `FIELD_ENCRYPTION_KEY` · `FIELD_ENCRYPTION_KEY_VERSION=1` · `PHONE_HASH_KEY` · `CRON_SECRET` · `APP_URL=https://<โดเมน>` |

- **ห้ามตั้ง** `DEV_LOGIN` ใน production (dev login ถูกปิดด้วย `NODE_ENV=production` อยู่แล้ว)
- เก็บ `FIELD_ENCRYPTION_KEY` และ `PHONE_HASH_KEY` สำรองไว้นอกระบบ (password manager ของบริษัท) — หาย = อ่านข้อมูลเข้ารหัสไม่ได้ตลอดไป
- หมุนกุญแจ: ย้ายค่าเดิมไป `FIELD_ENCRYPTION_KEY_PREVIOUS`, ใส่ค่าใหม่ + เพิ่ม `FIELD_ENCRYPTION_KEY_VERSION`

## 2. ฐานข้อมูล

```bash
npx supabase link --project-ref <ref>
npx supabase db push            # migrations 0001–0009
```

- สร้างบัญชีเจ้าของใน Supabase Auth (Dashboard → Authentication → Add user) แล้ว `insert into users (auth_user_id, role, display_name) values ('<auth id>', 'owner', '<ชื่อ>')`
- Storage buckets `kyc-docs`, `checkins`, `receipts`, `audit-exports` ต้องเป็น private (`public-assets` เท่านั้นที่ public) (migration สร้างให้แล้ว — ตรวจใน Dashboard)
- **NFR-08 backup**: เปิด Point-in-Time Recovery (Pro plan) · ซ้อม restore ลง staging 1 ครั้งก่อนเปิดจริง แล้วจดเวลาที่ใช้

## 3. ค่าที่ต้องกรอก (`/admin/settings`, `/admin/compliance`, `/admin/prices`)

| ค่า | ที่มา | ถ้าไม่กรอก |
|---|---|---|
| ✋ `allowed_registrations` ประเภทจดทะเบียนที่รับงานแต่ละบริการได้ | คำตอบ ขบ. เป็นลายลักษณ์อักษร | **ไม่มีรถคันไหนรับงานได้** |
| ✋ `license_coverage` ใบขับขี่ประเภทไหนขับรถอะไร | ขบ. | ไม่มีคนขับผ่านเกณฑ์ |
| ✋ `compliance.bg_check_valid_years` | ทนาย | ใช้ค่าเริ่ม |
| ✋ `withholding.rate` / `base` | นักบัญชี | หัก ณ ที่จ่าย = 0 (หลังบ้านเตือน) |
| ✋ `vat_registered`, `tax_category` ต่อบริการ | นักบัญชี | ใบเสร็จธรรมดา |
| ✋ `customer_terms`, `driver_terms`, `privacy_notice` (เวอร์ชัน + ลิงก์) | ทนาย | ใช้ร่างของระบบ — **ไม่ควรเปิดจริง** |
| `company` ชื่อ ที่อยู่ เลขผู้เสียภาษี PromptPay | บริษัท | ใบเสร็จ/QR ผิด |
| `airports` พิกัด BKK/DMK (ตรงอาคารผู้โดยสาร) · `route_estimate` ตัวคูณระยะ/ความเร็วเฉลี่ย · `line_oa_url` · `brand` · `emergency` เบอร์ | บริษัท | — |
| ราคา ทุกประเภทรถ × บริการที่เปิดขาย | ชีต Pilot 2.2 + กม./ชม.ที่รวม | ประเภทนั้นขอราคาไม่ได้ |

## 4. ย้ายข้อมูล Pilot (§17)

1. Export แท็บ 1.2 / 1.3 / jobs / ads เป็น CSV UTF-8 → ตั้งชื่อ `vehicles.csv` `drivers.csv` `jobs.csv` `ads.csv` ในโฟลเดอร์เดียว (ตัวอย่างรูปแบบ: `tests/fixtures/pilot/`)
2. **staging**: `npm run import:pilot -- <โฟลเดอร์>` (dry-run) → แก้ชีตจนผ่าน → `--apply` → ตรวจรายงาน/ยอด payout เทียบชีต
3. **production**: รันซ้ำพร้อม `--apply --i-know-this-is-production` (ใช้ env production)
4. ส่งลิงก์ใน `pilot-invites.csv` ให้คนขับทีละคนทาง LINE ส่วนตัว แล้ว **ลบไฟล์**
5. ไม่ย้าย: ชื่อ/เบอร์ลูกค้า (ไม่มี consent) — งานเก่าผูกบัญชี "ลูกค้า Pilot" ที่ถูกระงับ ใช้ทำรายงานเท่านั้น · ไม่ออกใบเสร็จย้อนหลัง

## 5. งานอัตโนมัติ (cron)

ทุกตัว `POST` + header `Authorization: Bearer $CRON_SECRET` · ตั้งด้วย Supabase `pg_cron` + `pg_net` หรือ cron ภายนอก (Vercel Cron บน Hobby รันได้วันละครั้ง — ไม่พอ)

| endpoint | รอบ |
|---|---|
| `/api/jobs/outbox` | ทุก 1 นาที |
| `/api/jobs/expire-offers` | ทุก 1 นาที |
| `/api/jobs/expire-quotes` | ทุก 5 นาที |
| `/api/jobs/expire-unpaid` | ทุก 5 นาที |
| `/api/jobs/auto-complete` | ทุก 15 นาที |
| `/api/jobs/reminders` | ทุก 15 นาที |
| `/api/jobs/doc-expiry` | ทุกวัน 08:00 |
| `/api/jobs/future-job-guard` | ทุกวัน 08:00 |
| `/api/jobs/payout-build` | ทุกวัน 06:00 |
| `/api/jobs/cleanup` | ทุกวัน 03:00 |
| `/api/jobs/audit-export` | ทุกวัน 00:30 (ส่งออก audit ของเมื่อวานเป็น JSONL ไป bucket `audit-exports`) |

ตัวอย่าง pg_cron:

```sql
select cron.schedule('outbox', '* * * * *', $$
  select net.http_post('https://<โดเมน>/api/jobs/outbox',
    headers => jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    body => '{}'::jsonb) $$);
```

> audit log ใน production ควรคัดลอกต่อไป storage ภายนอกแบบเขียนครั้งเดียว (เช่น S3 Object Lock) — bucket ใน Supabase ลบได้โดยผู้มีสิทธิ์ service role

## 6. Monitoring

- Uptime monitor (UptimeRobot/Better Stack) ยิง `GET /api/health` ทุก 1–5 นาที → 503 = DB ล่ม · ดู `outbox_dead`, `outbox_worker_last_ok` ในผลลัพธ์
- เจ้าของเปิด `/admin/system` ทุกวัน (งานไหนแดง = cron ไม่รัน)
- Vercel → Logs/Observability เปิด alert error rate (log ถูกตัดข้อมูลอ่อนไหวแล้ว)

## 7. แผนสำรอง (degraded mode)

| เหตุการณ์ | ทำอะไร |
|---|---|
| ระบบล่ม/ต้องปิดปรับปรุง | ตั้ง `MAINTENANCE_MODE=true` ใน Vercel → redeploy (ไม่ต้อง build ใหม่: Instant Rollback/Promote) → ทุกหน้าแสดงหน้าแจ้ง + ปุ่ม LINE OA, API ตอบ 503 (ยกเว้น `/api/health`) |
| LINE ส่งข้อความไม่ได้ | outbox ลองใหม่อัตโนมัติ → dead ขึ้นที่ `/admin/system` → โทรแจ้งลูกค้า/คนขับ แล้วกดส่งใหม่ |
| ราคาประมาณคลาดจากระยะถนนจริงมาก | แอดมินสร้างใบเสนอราคาใหม่โดยกรอกระยะทางเอง (`distance_source = manual`) · ถ้าคลาดสม่ำเสมอ ปรับ `route_estimate.road_factor` |
| ตรวจสลิปอัตโนมัติไม่ได้ | สลิปเข้า "รออนุมัติ" ให้เจ้าของตรวจมือ |
| deploy ใหม่พัง | Vercel Instant Rollback ไป deployment ก่อนหน้า · migration ต้องเขียนแบบเพิ่มอย่างเดียว (ไม่ลบคอลัมน์ใน release เดียวกัน) |

## 8. ก่อนเปิดจริง (UAT)

- [ ] CI (unit + pgTAP + E2E) เขียวบน commit ที่จะ deploy — E2E ใช้ dev login จึงรันได้แค่ใน CI/local ส่วน staging ทดสอบด้วยมือตามข้อถัดไป
- [ ] จองจริงด้วยเงินจริง 1 งานต่อบริการ (คนในทีมเป็นลูกค้า) ครบวงจร: ขอราคา → มัดจำ → เสนองาน → วันงาน 4 ขั้น → ใบเสร็จ → payout
- [ ] ยกเลิก 1 งาน ดูยอดคืนตรงนโยบาย
- [ ] คนขับทุกคนเข้าลิงก์เชิญ ส่งเอกสาร และเจ้าของอนุมัติครบ
- [ ] ซ้อม `MAINTENANCE_MODE` บน staging · ซ้อม restore backup
- [ ] load test บน staging: `MODE=realistic` p95 < 500 ms (ดู README)
- [ ] ลบบัญชีทดสอบ/ข้อมูลทดสอบออกจาก production
