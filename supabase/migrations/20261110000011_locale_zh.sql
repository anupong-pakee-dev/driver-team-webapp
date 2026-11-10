-- ฝั่งลูกค้ารองรับ 3 ภาษา: ไทย · อังกฤษ · จีนตัวย่อ (users.locale ใช้เลือกภาษาข้อความ LINE)
alter table users drop constraint users_locale_check;
alter table users add constraint users_locale_check check (locale in ('th', 'en', 'zh'));

-- ชื่อบริการ/รถในแคตตาล็อกภาษาจีน (เจ้าของแก้ได้ที่ /admin/settings → catalog: label_zh, note_zh, name_zh, desc_zh)
update settings set value = jsonb_set(value, '{tabs}', (
  select jsonb_agg(t || case t->>'service_type'
    when 'airport_transfer' then '{"label_zh":"机场接送","note_zh":"机场 ↔ 曼谷 · 按趟计价，含油费和司机"}'::jsonb
    when 'daily_charter'    then '{"label_zh":"按天包车","note_zh":"全天包车 10 小时 · 含油费和司机"}'::jsonb
    when 'point_to_point'   then '{"label_zh":"跨府长途","note_zh":"曼谷 ↔ 外府 · 按距离计价"}'::jsonb
    when 'hourly_charter'   then '{"label_zh":"按小时包车","note_zh":"曼谷市内按小时包车"}'::jsonb
    else '{}'::jsonb end order by ord)
  from jsonb_array_elements(value->'tabs') with ordinality as x(t, ord)))
where key = 'catalog' and jsonb_typeof(value->'tabs') = 'array';

update settings set value = jsonb_set(value, '{cars}', (
  select jsonb_object_agg(k, v || case k
    when 'sedan'       then '{"name_zh":"轿车"}'::jsonb
    when 'suv'         then '{"name_zh":"7 座 SUV"}'::jsonb
    when 'van'         then '{"name_zh":"面包车"}'::jsonb
    when 'van_vip'     then '{"name_zh":"VIP 商务车"}'::jsonb
    when 'mpv_premium' then '{"name_zh":"豪华 MPV"}'::jsonb
    when 'driver_only' then '{"name_zh":"仅代驾司机","desc_zh":"驾驶您的车辆"}'::jsonb
    else '{}'::jsonb end)
  from jsonb_each(value->'cars') as x(k, v)))
where key = 'catalog' and jsonb_typeof(value->'cars') = 'object';

update settings set value = value || '{"name_zh":"Avera Taxi Thailand"}'::jsonb where key = 'brand' and not value ? 'name_zh';
