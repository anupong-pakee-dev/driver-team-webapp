# ตั้งเว็บทดลอง (staging) บน Vercel ทีละขั้น

ทำตามลำดับ เพราะแต่ละขั้นต้องใช้ค่าจากขั้นก่อนหน้า · ใช้เวลารวมประมาณ 2–3 ชม. · ช่วงทดลองใช้ Vercel Hobby (ฟรี) ได้ ก่อนเปิดรับลูกค้าจริงค่อยอัปเป็น Pro

```
0 GitHub → 1 Supabase → 2 สุ่ม secrets → 3 Vercel (deploy ครั้งแรก ได้ URL)
→ 4 แผนที่ (ไม่ต้องทำอะไร) → 5 LINE (ต้องมี URL แล้ว) → 6 cron → 7 ข้อมูลในหลังบ้าน → 8 ทดสอบ
```

จดค่าที่ได้แต่ละขั้นไว้ใน password manager (เช่น Bitwarden/1Password) ห้ามจดใน LINE/อีเมล

---

## 0. เอาโค้ดขึ้น GitHub

ตอนนี้โค้ดอยู่บนเครื่องที่ branch `feat/driver-platform-s1-s7` ยังไม่มี remote

1. github.com → **New repository** → ชื่อ `driver-team-startup` → เลือก **Private** → ไม่ต้องติ๊ก README → Create
2. ในโฟลเดอร์โปรเจกต์:

```bash
git branch -M feat/driver-platform-s1-s7 main
```

```bash
git remote add origin https://github.com/<user>/driver-team-startup.git
```

```bash
git push -u origin main
```

(ถ้ามี branch `master` เก่าอยู่ ลบหรือไม่สนใจก็ได้ มีแค่ commit จาก Create Next App)

---

## 1. Supabase (ฐานข้อมูล)

### 1.1 สร้าง project
1. supabase.com/dashboard → **New project**
2. Name: `driver-team-staging` · Region: **Southeast Asia (Singapore)** · Database password: กด Generate แล้ว **จดไว้**
3. รอ 1–2 นาทีให้สร้างเสร็จ

### 1.2 จดค่า 4 ตัว
| ค่า | ที่อยู่ |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → Data API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → Publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API Keys → Secret key (กด Reveal) |
| `DATABASE_URL` | ปุ่ม **Connect** (ด้านบน) → **Transaction pooler** → คัดลอก แล้วแทน `[YOUR-PASSWORD]` ด้วยรหัสจากข้อ 1.1 (port ต้องเป็น **6543**) |

### 1.3 สร้างตาราง (migrations)
ในโฟลเดอร์โปรเจกต์:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <ref>
```

(`<ref>` = ตัวอักษรใน Project URL `https://<ref>.supabase.co` · ระบบจะถามรหัสฐานข้อมูล)

```bash
npx supabase db push
```

ต้องขึ้นว่า apply migrations 0001–0009 ครบ

### 1.4 ใส่ข้อมูลตั้งต้น (สำคัญ — `db push` ไม่ทำให้)
1. Dashboard → **SQL Editor** → New query
2. เปิดไฟล์ `supabase/seed.sql` คัดลอกทั้งไฟล์ไปวาง → **Run**
3. ได้: ค่าตั้งค่าทั้งหมด + ราคาตัวอย่าง (ต้องแก้เป็นราคาจริงในขั้น 7)

### 1.5 สร้างบัญชีเจ้าของ
1. Dashboard → **Authentication → Users → Add user → Create new user**
2. ใส่อีเมล + รหัสผ่าน (ยาว ≥ 12 ตัว) · ติ๊ก **Auto Confirm User** → Create
3. คลิก user ที่สร้าง → คัดลอก **User UID**
4. SQL Editor → รัน:

```sql
insert into users (auth_user_id, role, display_name) values ('<User UID>', 'owner', '<ชื่อคุณ>');
```

แอดมินขาย ทำแบบเดียวกันแต่ใช้ `'sales_admin'`

---

## 2. สุ่ม secrets (บนเครื่อง)

```bash
node -e "const c=require('crypto');for(const k of ['SESSION_SECRET','FIELD_ENCRYPTION_KEY','PHONE_HASH_KEY'])console.log(k+'='+c.randomBytes(32).toString('base64'));console.log('CRON_SECRET='+c.randomBytes(24).toString('hex'))"
```

จดทั้ง 4 บรรทัด · ⚠️ `FIELD_ENCRYPTION_KEY` และ `PHONE_HASH_KEY` หาย = อ่านข้อมูลที่เข้ารหัสไม่ได้อีก

---

## 3. Vercel (deploy ครั้งแรก)

### 3.1 Import
1. vercel.com → **Add New → Project** → Import repo `driver-team-startup` จาก GitHub
2. Framework: Next.js (ตรวจเจอเอง) · ไม่ต้องแก้ Build command

### 3.2 ใส่ Environment Variables (ก่อนกด Deploy)
เปิด **Environment Variables** แล้วใส่:

| Key | Value |
|---|---|
| `DATABASE_URL` | จากข้อ 1.2 |
| `NEXT_PUBLIC_SUPABASE_URL` | จากข้อ 1.2 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | จากข้อ 1.2 |
| `SUPABASE_SERVICE_ROLE_KEY` | จากข้อ 1.2 |
| `SESSION_SECRET` `FIELD_ENCRYPTION_KEY` `PHONE_HASH_KEY` `CRON_SECRET` | จากข้อ 2 |
| `FIELD_ENCRYPTION_KEY_VERSION` | `1` |
| `DB_POOL_MAX` | `3` |
| `DATABASE_CA_CERT` | Supabase → Database → **SSL Configuration → Download certificate** → เปิดไฟล์ `.crt` ด้วย Notepad → คัดลอกทั้งหมด (รวมบรรทัด `-----BEGIN/END CERTIFICATE-----`) · ไม่ใส่ = ต่อฐานข้อมูลแบบไม่เข้ารหัส |

**อย่าใส่** `DEV_LOGIN` / `DEV_SEED_PASSWORD`

กด **Deploy** → รอ 2–3 นาที

### 3.3 ตั้ง URL และ region
1. deploy เสร็จจะได้ URL เช่น `https://driver-team-startup.vercel.app` → **จดไว้** (เรียกว่า `<URL>` ในขั้นต่อไป)
2. Settings → Environment Variables → เพิ่ม `APP_URL` = `<URL>` (ไม่มี `/` ท้าย)
3. Settings → **Functions → Function Region** → เลือก **Singapore (sin1)** (ใกล้ฐานข้อมูล เร็วขึ้นมาก)
4. Deployments → deployment ล่าสุด → ⋯ → **Redeploy**

### 3.4 เช็ก
- เปิด `<URL>/api/health` → ต้องได้ `{"ok":true,...}` · ถ้าได้ 503 = `DATABASE_URL` ผิด
- เปิด `<URL>/admin/login` → login ด้วยบัญชีจากข้อ 1.5 ได้
- ⚠️ ใช้ URL ของ **Production deployment** (ตัวที่ไม่มีเลขสุ่มยาว ๆ) — URL ของ Preview จะติด Vercel login ทำให้ LINE เรียก webhook ไม่ได้

---

## 4. แผนที่ — ไม่ต้องสมัครหรือผูกบัตร

ระบบไม่ใช้ API แผนที่ที่มีค่าใช้จ่ายแล้ว:
- ลูกค้าระบุตำแหน่งเอง: **📍 ตำแหน่งปัจจุบัน** (GPS มือถือ) · **🗺️ ปักหมุด** บนแผนที่ OpenStreetMap · **🔗 วางลิงก์** ที่แชร์จากแอป Google Maps หรือพิกัด
- ราคา = ระยะเส้นตรงผ่านทุกจุด × 1.35 (ประมาณระยะถนน) แล้วคิดตามตารางราคา · ปรับตัวคูณได้ที่ ตั้งค่า → `route_estimate`
- คนขับกด **Google Maps** หรือ **Waze** ในหน้างานเพื่อนำทางไปที่หมุด

ไม่ต้องใส่ env อะไรเพิ่ม ถ้าเคยใส่ `GOOGLE_MAPS_SERVER_KEY` ใน Vercel ลบทิ้งได้

---

## 5. LINE

ต้องมี `<URL>` จากขั้น 3 แล้ว · ⚠️ ทุก channel ต้องอยู่ใต้ **Provider เดียวกัน**

### 5.1 LINE OA + Messaging API
1. manager.line.biz → **Create** → สร้าง OA (แนะนำทำ OA แยกสำหรับทดลอง เช่น "[ชื่อแบรนด์] TEST")
2. ในหน้า OA → **Settings → Messaging API → Enable Messaging API** → **Create new provider** (ชื่อบริษัท) → OK
3. Settings → **Response settings**: Webhook = **เปิด** · Auto-response = **ปิด**
4. จด **Basic ID** (`@xxxx`) → `NEXT_PUBLIC_LINE_OA_URL` = `https://line.me/R/ti/p/@xxxx`

### 5.2 Secret / Token / Webhook
1. developers.line.biz/console → คลิก Provider → channel **Messaging API**
2. **Basic settings** → **Channel secret** → `LINE_CHANNEL_SECRET`
3. แท็บ **Messaging API**:
   - ล่างสุด **Channel access token (long-lived)** → **Issue** → `LINE_CHANNEL_ACCESS_TOKEN`
   - **Webhook URL** → Edit → `<URL>/api/webhooks/line` → **Update** (ต้องกด Update ก่อน สวิตช์ข้างล่างถึงจะเปิดได้)
   - เปิด **Use webhook**
   - ยังไม่ต้องกด Verify (รอขั้น 5.5)

### 5.3 LINE Login channel
1. กลับหน้า Provider เดิม → **Create a new channel → LINE Login**
2. Region: Thailand · App types: ติ๊ก **Web app** · กรอกชื่อ/อีเมล → Create
3. **Basic settings** → **Channel ID** → `LINE_LOGIN_CHANNEL_ID`
4. **Basic settings → Linked LINE Official Account → Edit** → เลือก OA จากข้อ 5.1

### 5.4 LIFF 2 ตัว (ใน LINE Login channel)
แท็บ **LIFF → Add** ทำ 2 รอบ:

| ช่อง | ลูกค้า | คนขับ |
|---|---|---|
| Size | Full | Full |
| Endpoint URL | `<URL>/liff/customer` | `<URL>/liff/driver` |
| Scopes | ✅ openid ✅ profile | ✅ openid ✅ profile |
| Add friend option | On (Aggressive) | On (Aggressive) |

ได้ LIFF ID → `NEXT_PUBLIC_LIFF_ID_CUSTOMER` และ `NEXT_PUBLIC_LIFF_ID_DRIVER`

ช่วงทดลอง **ไม่ต้อง Publish** channel — ให้เพิ่มคนในทีมที่ แท็บ **Roles → Invite** เป็น Tester (คนนอกจะ login ไม่ได้ ซึ่งดีสำหรับ staging)

### 5.5 ใส่ค่าแล้วทดสอบ
1. Vercel → เพิ่ม 6 ค่า (`LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_LOGIN_CHANNEL_ID`, `NEXT_PUBLIC_LIFF_ID_CUSTOMER`, `NEXT_PUBLIC_LIFF_ID_DRIVER`, `NEXT_PUBLIC_LINE_OA_URL`) → **Redeploy** (ต้อง redeploy เพราะค่า `NEXT_PUBLIC_` ถูกฝังตอน build)
2. LINE Developers → Messaging API → **Verify** → ต้องได้ **Success**
3. ในแอป LINE มือถือ เปิดแชตกับตัวเองแล้วส่ง `https://liff.line.me/<LIFF_ID_CUSTOMER>` → กด → ต้องขออนุญาต + ชวนเพิ่มเพื่อน OA → เข้าหน้าลูกค้าได้

| Verify ไม่ผ่าน | แก้ |
|---|---|
| 401 | `LINE_CHANNEL_SECRET` ผิดตัว (ต้องเป็นของ Messaging API ไม่ใช่ LINE Login) → แก้ + Redeploy |
| 404 | URL พิมพ์ผิด / ยังไม่ redeploy |
| ไปหน้า Vercel login / 401 HTML | ใช้ URL ของ Preview → เปลี่ยนเป็น URL ของ Production |
| 500 / timeout | ดู Vercel → Logs (ส่วนใหญ่ `DATABASE_URL`) |

### 5.6 ริชเมนู (OA Manager → Rich menus → Create)
- ขอใบเสนอราคา → `https://liff.line.me/<LIFF_ID_CUSTOMER>/quote`
- การจองของฉัน → `https://liff.line.me/<LIFF_ID_CUSTOMER>`
- สำหรับคนขับ → `https://liff.line.me/<LIFF_ID_DRIVER>`

---

## 6. งานอัตโนมัติ (cron ใน Supabase)

1. Supabase Dashboard → **Database → Extensions** → เปิด **pg_cron** และ **pg_net**
2. SQL Editor → แก้ `<URL>` และ `<CRON_SECRET>` แล้วรัน (⚠️ เวลาใน pg_cron เป็น **UTC** = เวลาไทย − 7 ชม.):

```sql
select cron.schedule(j.name, j.sched, format(
  $f$select net.http_post(url := %L, body := '{}'::jsonb,
     headers := jsonb_build_object('Authorization', %L, 'Content-Type', 'application/json'))$f$,
  '<URL>/api/jobs/' || j.path, 'Bearer <CRON_SECRET>'))
from (values
  ('outbox',           '* * * * *',    'outbox'),
  ('expire_offers',    '* * * * *',    'expire-offers'),
  ('expire_quotes',    '*/5 * * * *',  'expire-quotes'),
  ('expire_unpaid',    '*/5 * * * *',  'expire-unpaid'),
  ('auto_complete',    '*/15 * * * *', 'auto-complete'),
  ('reminders',        '*/15 * * * *', 'reminders'),
  ('doc_expiry',       '0 1 * * *',    'doc-expiry'),        -- 08:00 ไทย
  ('future_job_guard', '0 1 * * *',    'future-job-guard'),  -- 08:00 ไทย
  ('payout_build',     '0 23 * * *',   'payout-build'),      -- 06:00 ไทย
  ('cleanup',          '0 20 * * *',   'cleanup'),           -- 03:00 ไทย
  ('audit_export',     '30 17 * * *',  'audit-export')       -- 00:30 ไทย
) as j(name, sched, path);
```

3. รอ 2–3 นาที → เปิด `<URL>/admin/system` → outbox / expire_offers ต้องขึ้นว่ารันสำเร็จ
4. ถ้าไม่ขึ้น: SQL Editor → `select * from net._http_response order by created desc limit 5;` ดู status (401 = CRON_SECRET ไม่ตรง)

เปลี่ยน CRON_SECRET ทีหลัง: `select cron.unschedule(jobname) from cron.job;` แล้วรันข้อ 2 ใหม่

---

## 7. ข้อมูลในหลังบ้าน (`<URL>/admin` ด้วยบัญชีเจ้าของ)

| เมนู | ต้องแก้ |
|---|---|
| ตั้งค่า → `company` | ชื่อบริษัท ที่อยู่ เลขผู้เสียภาษี · **`promptpay_id` ตอนนี้เป็นเบอร์ตัวอย่าง `0812345678` ต้องเปลี่ยนเป็นของบริษัท** ไม่งั้นลูกค้าโอนผิดคน |
| ตั้งค่า → `airports` | ใช้พิกัด lat/lng (ค่าเริ่มเป็นพิกัดโดยประมาณของสุวรรณภูมิ/ดอนเมือง) → เปิดแผนที่ตรวจว่าตรงอาคารผู้โดยสาร ถ้าคลาดให้แก้ lat/lng · `place_id` ไม่ใช้แล้ว |
| ตั้งค่า → `brand`, `line_oa_url`, `emergency.owner_phone` | ชื่อแบรนด์ ลิงก์ OA เบอร์เจ้าของ |
| ราคา | แทนราคาตัวอย่างด้วยราคาจริง (Pilot 2.2) |
| กฎ ขบ. | ประเภทจดทะเบียนที่รับงานได้ + ใบขับขี่↔ประเภทรถ · ช่วงทดลองกรอกค่าชั่วคราวเพื่อทดสอบได้ แต่ **ก่อนเปิดจริงต้องเป็นคำตอบ ขบ.** · ว่าง = ไม่มีรถคันไหนรับงานได้ |
| คนขับ → เชิญ | เชิญตัวเอง/คนในทีมเป็นคนขับทดสอบ (เบอร์จริง) → เปิดลิงก์ใน LINE → ส่งเอกสาร → อนุมัติ |

---

## 8. ทดสอบครบวงจร (คนในทีมเป็นทั้งลูกค้าและคนขับ)

- [ ] ลูกค้า: ริชเมนู → ขอราคา → ได้ราคา → ยอมรับ → สแกน QR แล้วชื่อบัญชีปลายทางต้องเป็นของบริษัท → โอนยอดมัดจำจริง (ตั้งราคาทดสอบต่ำ ๆ ได้) → ส่งสลิป
- [ ] เจ้าของ: กล่องงานวันนี้มีสลิปรออนุมัติ → อนุมัติ (ยังไม่มี API ตรวจสลิปอัตโนมัติ — ตรวจด้วยมือทุกใบ)
- [ ] ลูกค้าได้ข้อความยืนยัน + ใบเสร็จใน LINE
- [ ] คนขับได้ข้อความเสนองาน → รับ → วันงานกด 4 ขั้น (ขั้นรับลูกค้าต้องถ่ายรูป)
- [ ] ลูกค้ายืนยันงานจบ → วันถัดไป payout ขึ้นในหน้าจ่ายเงินคนขับ
- [ ] ยกเลิก 1 งาน → ยอดคืนตรงนโยบาย
- [ ] `<URL>/admin/system` ไม่มีงานแดง ไม่มีข้อความค้าง
- [ ] ตั้ง UptimeRobot ยิง `<URL>/api/health` ทุก 5 นาที

ผ่านทั้งหมดแล้วค่อยทำ production ตาม [go-live.md](go-live.md) (project Supabase ใหม่ + secrets ชุดใหม่ + OA จริง + Publish LINE Login + Vercel Pro)
