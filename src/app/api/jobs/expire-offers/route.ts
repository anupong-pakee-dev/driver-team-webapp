import { jobRoute } from "@/lib/job";
import { expireOffers } from "@/services/dispatch";

// §10 expire_offers ทุก 1 นาที (BR-DISP-04)
export const POST = jobRoute("expire_offers", expireOffers);
