import { z } from "zod";
import { jobRoute } from "@/lib/job";
import { BizError } from "@/lib/errors";
import { runDocExpiry } from "@/services/compliance";

// §10 doc_expiry ทุกวัน 08:00 · นอก production ส่ง { today } เพื่อจำลองวันได้ (FR-VEH-05 AC)
const Body = z.strictObject({ today: z.iso.date().optional() });

export const POST = jobRoute("doc_expiry", async (req) => {
  const body = Body.parse(await req.json().catch(() => ({})));
  if (body.today && process.env.NODE_ENV === "production") throw new BizError("FORBIDDEN");
  return runDocExpiry(body.today);
});
