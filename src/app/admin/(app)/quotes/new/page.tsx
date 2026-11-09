import { randomUUID } from "node:crypto";
import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { bangkokLocalInput } from "@/lib/time";
import { quoteFormOptions } from "@/services/quoteForm";
import { QuoteForm } from "@/components/QuoteForm";
import { Panel } from "@/components/ui";
import { AddCustomer } from "./add-customer";

// sales_admin / owner ออกใบเสนอราคาแทนลูกค้าที่ทักแชท (FR-QUOTE-01) · เลือกรถได้ทุกประเภทที่มีราคา
export default async function NewQuote({ searchParams }: PageProps<"/admin/quotes/new">) {
  const user = await requireStaffPage(["sales_admin", "owner"]);
  const sp = await searchParams;
  const customers = await asUser(user.authUserId, async (db) => (await db.query(
    `select u.id, coalesce(u.display_name, 'ลูกค้า LINE (ยังไม่มีชื่อ)') as name, u.created_at,
            coalesce(line_linked(u.id), false) as linked
       from users u where u.role in ('customer','corporate_customer') and u.status = 'active'
      order by u.created_at desc limit 500`,
  )).rows);
  const options = await quoteFormOptions(false);

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">ออกใบเสนอราคา</h1>
      <Panel title="ลูกค้าใหม่ที่ไม่มี LINE">
        <AddCustomer />
      </Panel>
      <Panel>
        <QuoteForm
          mode="staff"
          options={options}
          customers={customers.map((c) => ({
            id: c.id,
            label: `${c.name}${c.linked ? " · LINE" : " · ไม่มี LINE (ส่งลิงก์เอง)"}`,
          }))}
          initialService={typeof sp.service === "string" ? sp.service : undefined}
          idempotencyKey={randomUUID()}
          minPickup={bangkokLocalInput(0)}
        />
      </Panel>
    </div>
  );
}
