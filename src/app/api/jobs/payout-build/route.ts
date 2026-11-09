import { jobRoute } from "@/lib/job";
import { buildPayouts } from "@/services/payouts";

// §7.5 รอบจ่าย ⚙️ รายวัน: งานที่ปล่อยเงินได้ → payout สถานะ ready
export const POST = jobRoute("payout_build", () => buildPayouts());
