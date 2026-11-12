-- เอกสารรถที่ "ต้องส่ง" ตั้งได้ใน settings.compliance.required_docs.vehicle
-- เดิมเกณฑ์รับงานบังคับตรวจประกันผู้โดยสาร / ภาษีรถ / ตรวจสภาพ เสมอ แม้ไม่ได้อยู่ในรายการที่ต้องส่ง
-- → ตรวจวันหมดอายุของ 3 อย่างนี้เฉพาะเมื่อเอกสารนั้นอยู่ในรายการที่ต้องส่ง
-- พ.ร.บ. / ประกันภาคสมัครใจ (และประเภทการใช้ประกัน) ยังตรวจเสมอ

create or replace function vehicle_ineligible_reasons(v vehicles, svc service_type, on_date date)
returns text[] language sql stable as $$
  with req as (select required_doc_types('vehicle') as docs)
  select array_remove(array[
    case when v.kyc_status <> 'approved' then 'kyc_not_approved' end,
    case when not exists (select 1 from allowed_registrations a
                          where a.service_type = svc and a.registration_type = v.registration_type)
         then 'registration_not_allowed' end,
    case when coalesce(v.compulsory_insurance_expiry, '-infinity'::date) < on_date then 'compulsory_ins_expired' end,
    case when v.voluntary_insurance_usage is null
           or v.voluntary_insurance_usage not in ('commercial_hire','rental','public')
         then 'insurance_usage_invalid' end,
    case when coalesce(v.voluntary_insurance_expiry, '-infinity'::date) < on_date then 'voluntary_ins_expired' end,
    case when 'passenger_ins' = any(req.docs)
          and coalesce(v.passenger_insurance_expiry, '-infinity'::date) < on_date then 'passenger_ins_expired' end,
    case when 'tax_receipt' = any(req.docs)
          and coalesce(v.tax_expiry, '-infinity'::date) < on_date then 'tax_expired' end,
    case when 'inspection' = any(req.docs)
          and coalesce(v.inspection_due, '-infinity'::date) < on_date then 'inspection_due' end,
    case when not v.active then 'inactive' end
  ], null) from req $$;
