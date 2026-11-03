import { jobRoute } from "@/lib/job";
import { futureJobGuard } from "@/services/trip";

// §10 future_job_guard ทุกวัน 08:00 (BR-COMP-04)
export const POST = jobRoute("future_job_guard", futureJobGuard);
