import { jobRoute } from "@/lib/job";
import { expireQuotes } from "@/services/quotes";

// §10 expire_quotes ทุก 5 นาที (FR-QUOTE-04)
export const POST = jobRoute("expire_quotes", expireQuotes);
