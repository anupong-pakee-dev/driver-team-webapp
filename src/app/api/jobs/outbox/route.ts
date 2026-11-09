import { jobRoute } from "@/lib/job";
import { processOutbox } from "@/services/outbox";

// §10 outbox_worker — เรียกจาก scheduler ทุก 30–60 วินาที ด้วย CRON_SECRET
export const POST = jobRoute("outbox_worker", () => processOutbox());
