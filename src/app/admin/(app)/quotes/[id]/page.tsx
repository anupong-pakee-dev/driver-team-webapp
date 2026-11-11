import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { getSetting, type Brand } from "@/lib/settings";
import { formatBangkok } from "@/lib/time";
import { loadQuote, QUOTE_STATUS_TH } from "@/services/quoteView";
import { PrintButton } from "@/components/PrintButton";
import { QuoteView } from "@/components/QuoteView";
import { Badge, Panel, btnSecondary } from "@/components/ui";
import { ApproveDiscount, DiscountForm } from "./discount";

export default async function AdminQuote({ params }: PageProps<"/admin/quotes/[id]">) {
  const user = await requireStaffPage(["sales_admin", "owner"]);
  const { id } = await params;
  const data = await asUser(user.authUserId, async (db) => {
    const q = await loadQuote(db, id);
    if (!q) return null;
    const { rows: revs } = await db.query(
      `select q.id, q.revision, q.status, q.final_satang::int, q.discount_satang::int, q.discount_reason, q.created_at,
              u.display_name as by
         from quotes q left join users u on u.id = coalesce(q.discount_requested_by, q.created_by)
        where q.number = $1 order by q.revision`,
      [q.number],
    );
    const { rows: cust } = await db.query(
      `select display_name, coalesce(line_linked(id), false) as linked from users where id = $1`, [q.customer_id]);
    const { rows: floor } = await db.query(`select floor_satang::int from price_rules r join quotes q on q.price_rule_id = r.id where q.id = $1`, [id]);
    return { q, revs, cust: cust[0], floor: floor[0]?.floor_satang as number };
  });
  if (!data) notFound();
  const { q, revs, cust } = data;
  const brand = (await getSetting<Brand>("brand"))?.name_th ?? "";
  const maxPct = Number((await getSetting<number>("admin_max_discount")) ?? 0.1);
  const editable = q.status === "sent" && new Date(q.expires_at) > new Date();

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Link href="/admin/quotes" className="text-sm text-muted">← ใบเสนอราคา</Link>
          <PrintButton className={btnSecondary} />
        </div>
        <QuoteView q={q} brand={brand} showCosting />
      </div>
      <div className="space-y-4">
        <Panel title="ลูกค้า">
          <p>{cust?.display_name ?? "ลูกค้า LINE"}</p>
          <p className="text-sm text-muted">
            {cust?.linked ? "ส่ง Flex Message เข้า LINE แล้ว" : "ไม่มี LINE — คัดลอกลิงก์ส่งให้ลูกค้าเอง"}
          </p>
          <p className="mt-2 break-all font-mono text-xs text-muted">/liff/customer/quotes/{q.id}</p>
        </Panel>

        {q.status === "pending_approval" && user.role === "owner" && (
          <Panel title="ขออนุมัติส่วนลด">
            <p className="mb-3 text-sm">ลด {formatBaht(q.discount_satang)} ({Math.round((q.discount_satang / q.computed_satang) * 1000) / 10}%) — {q.discount_reason}</p>
            <ApproveDiscount id={q.id} />
          </Panel>
        )}
        {q.status === "pending_approval" && user.role !== "owner" && (
          <Panel><p className="text-sm text-warn">ส่วนลดเกิน {maxPct * 100}% — รอเจ้าของอนุมัติ</p></Panel>
        )}

        {editable && (
          <Panel title="ให้ส่วนลด (ออกฉบับใหม่)">
            <DiscountForm id={q.id} computed={q.computed_satang} floor={data.floor} maxPct={maxPct} role={user.role} />
          </Panel>
        )}

        <Panel title="ประวัติฉบับ">
          <ul className="space-y-2 text-sm">
            {revs.map((r) => {
              const st = QUOTE_STATUS_TH[r.status] ?? [r.status, "info"];
              return (
                <li key={r.id} className="flex items-start justify-between gap-2">
                  <Link href={`/admin/quotes/${r.id}`} className={r.id === q.id ? "font-bold" : "text-sage hover:underline"}>
                    rev.{r.revision} · {formatBaht(r.final_satang)}
                    <span className="block text-xs font-normal text-muted">
                      {r.by} · {formatBangkok(r.created_at)}{r.discount_reason && ` · ${r.discount_reason}`}
                    </span>
                  </Link>
                  <Badge tone={st[1]}>{st[0]}</Badge>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
