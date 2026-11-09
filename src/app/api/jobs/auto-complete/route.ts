import { jobRoute } from "@/lib/job";
import { autoComplete } from "@/services/trip";

// §10 auto_complete ทุก 15 นาที (BR-PAYOUT-01)
export const POST = jobRoute("auto_complete", autoComplete);
