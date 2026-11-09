import { jobRoute } from "@/lib/job";
import { expireUnpaid } from "@/services/bookings";

// §10 expire_unpaid ทุก 5 นาที (BR-PAY-01)
export const POST = jobRoute("expire_unpaid", expireUnpaid);
