import { jobRoute } from "@/lib/job";
import { cleanup } from "@/services/housekeeping";

// §10 idempotency_cleanup ทุกวัน (+ rate_limits, route_cache, job_runs เก่า)
export const POST = jobRoute("cleanup", () => cleanup());
