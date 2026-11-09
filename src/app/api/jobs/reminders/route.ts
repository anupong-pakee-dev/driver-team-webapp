import { jobRoute } from "@/lib/job";
import { reminders } from "@/services/trip";

// §10 reminders ทุก 15 นาที: วันก่อนงาน 18:00 และ 2 ชม. ก่อน
export const POST = jobRoute("reminders", () => reminders());
