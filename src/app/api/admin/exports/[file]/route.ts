import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { baht, toCsv } from "@/lib/csv";
import { asUser } from "@/lib/db";
import { BizError, errorResponse } from "@/lib/errors";

// FR-REP-02 · §8.2 GET /api/admin/exports/{bookings|payments|payouts}.csv?from&to (วันที่ตามเวลาไทย)
// ไม่มีชื่อ/เบอร์ลูกค้า — นักบัญชีใช้เลขที่เอกสารอ้างอิง
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const QUERIES = {
  "bookings.csv": {
    headers: ["booking_id", "quote_number", "created_at", "pickup_at", "status", "service_type", "car_type", "tax_category",
              "price_baht", "deposit_baht", "paid_baht", "refund_baht", "driver_share_baht", "source_platform", "campaign"],
    sql: `select b.id, q.number || '-r' || q.revision, b.created_at, b.pickup_at, b.status, b.service_type, b.car_type, q.tax_category,
                 b.price_satang, b.deposit_satang,
                 (select coalesce(sum(amount_satang),0) from payments p where p.booking_id = b.id and p.status = 'verified' and p.kind <> 'refund'),
                 b.refund_satang, b.driver_share_satang, b.source_platform, c.slug
            from bookings b join quotes q on q.id = b.quote_id left join campaigns c on c.id = b.campaign_id
           where (b.created_at at time zone 'Asia/Bangkok')::date between $1 and $2 order by b.created_at`,
    money: [8, 9, 10, 11, 12],
  },
  "payments.csv": {
    headers: ["payment_id", "booking_id", "created_at", "kind", "method", "status", "amount_baht", "receipt_number",
              "receipt_issued_at", "tax_category", "gateway_ref", "slip_ref", "refunded_at"],
    sql: `select p.id, p.booking_id, p.created_at, p.kind, p.method, p.status, p.amount_satang, r.number, r.issued_at, r.tax_category,
                 p.gateway_ref, p.slip_ref, p.refunded_at
            from payments p left join receipts r on r.payment_id = p.id
           where (p.created_at at time zone 'Asia/Bangkok')::date between $1 and $2 order by p.created_at`,
    money: [6],
  },
  "payouts.csv": {
    headers: ["payout_id", "driver", "created_at", "status", "paid_at", "jobs", "gross_baht", "commission_baht", "penalties_baht",
              "withholding_baht", "reimburse_baht", "net_baht"],
    sql: `select p.id, u.display_name, p.created_at, p.status, p.paid_at, (select count(*) from payout_items i where i.payout_id = p.id),
                 p.gross_satang, p.commission_satang, p.penalties_satang, p.withholding_satang, p.reimburse_satang, p.net_satang
            from payouts p join users u on u.id = p.driver_id
           where (p.created_at at time zone 'Asia/Bangkok')::date between $1 and $2 order by p.created_at`,
    money: [6, 7, 8, 9, 10, 11],
  },
} as const;

export async function GET(req: NextRequest, ctx: RouteContext<"/api/admin/exports/[file]">) {
  try {
    const user = await requireUser(["sales_admin", "owner"]);
    const file = (await ctx.params).file as keyof typeof QUERIES;
    const q = QUERIES[file];
    if (!q) throw new BizError("NOT_FOUND");
    const from = req.nextUrl.searchParams.get("from") ?? "";
    const to = req.nextUrl.searchParams.get("to") ?? "";
    if (!DATE.test(from) || !DATE.test(to) || from > to) throw new BizError("VALIDATION", { range: "from/to" });
    // อ่านผ่าน RLS ในนามผู้ขอ
    const rows = await asUser(user.authUserId, async (db) => (await db.query({ text: q.sql, values: [from, to], rowMode: "array" })).rows as unknown[][]);
    const money = new Set<number>(q.money);
    const body = toCsv([...q.headers], rows.map((r) => r.map((v, i) => (money.has(i) ? baht(v as number) : v))));
    return new Response(body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${file.replace(".csv", "")}_${from}_${to}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
