-- เฟส 6 (S6) payout / หลังบ้าน / แอด: FR-PAYOUT-01..03, FR-ADMIN-01/03, FR-REP-02, FR-ADS-01..04/10/14/17, FR-PDPA-01/05

-- ───────────── payout: เก็บยอดแยกต่องาน (ตรวจย้อนได้ว่าแต่ละงานคิดอย่างไร) ─────────────
alter table payout_items add column kind              text not null default 'job' check (kind in ('job','cancellation'));
alter table payout_items add column gross_satang      bigint not null default 0;
alter table payout_items add column commission_satang bigint not null default 0;
alter table payout_items add column withholding_satang bigint not null default 0;
alter table payout_items add column penalties_satang  bigint not null default 0;
alter table payout_items add column reimburse_satang  bigint not null default 0;
create trigger payout_items_audit after insert or update or delete on payout_items for each row execute function audit_row();

-- ยอดรวม payout = ผลรวมรายการเสมอ (P2)
create or replace function payouts_match_items() returns trigger language plpgsql as $$
declare s record;
begin
  select coalesce(sum(gross_satang),0) g, coalesce(sum(commission_satang),0) c, coalesce(sum(withholding_satang),0) w,
         coalesce(sum(penalties_satang),0) p, coalesce(sum(reimburse_satang),0) r
    into s from payout_items where payout_id = new.id;
  if (new.gross_satang, new.commission_satang, new.withholding_satang, new.penalties_satang, new.reimburse_satang)
     is distinct from (s.g, s.c, s.w, s.p, s.r) then
    raise exception 'PAYOUT_TOTALS_MISMATCH' using errcode = 'DT422';
  end if;
  return new;
end $$;
create constraint trigger payouts_match_items after insert or update on payouts
  deferrable initially deferred for each row execute function payouts_match_items();

-- โอนแล้วแก้ไม่ได้
create or replace function payouts_paid_immutable() returns trigger language plpgsql as $$
begin
  if old.status = 'paid' and (new is distinct from old) then
    raise exception 'PAYOUT_PAID_IMMUTABLE' using errcode = 'DT409';
  end if;
  return new;
end $$;
create trigger payouts_paid_immutable before update on payouts for each row execute function payouts_paid_immutable();

-- ───────────── FR-ADS-02 แคมเปญ: ปลายทางของลิงก์ ─────────────
alter table campaigns add column target text not null default 'landing' check (target in ('landing','line_oa'));
alter table campaigns add column created_at timestamptz not null default now();
alter table campaigns add constraint campaigns_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$');

-- FR-ADS-10: touchpoint ที่ไม่ยินยอม → นับแคมเปญได้ แต่ไม่ผูกคน/ไม่เก็บ click id
alter table touchpoints add column consented boolean not null default false;
alter table touchpoints add constraint touchpoints_no_tracking_without_consent
  check (consented or (click_id is null and user_id is null));
alter table touchpoints add column service_type service_type;
create trigger touchpoints_audit after update on touchpoints for each row execute function audit_row();

-- quote / booking อ้าง touchpoint ได้จริง
alter table quotes add constraint quotes_first_touch_fk foreign key (first_touch_id) references touchpoints(id);
alter table quotes add constraint quotes_last_touch_fk foreign key (last_touch_id) references touchpoints(id);
alter table bookings add constraint bookings_campaign_fk foreign key (campaign_id) references campaigns(id);
