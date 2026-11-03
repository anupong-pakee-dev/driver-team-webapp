import { jobRoute } from "@/lib/job";
import { auditExport } from "@/services/housekeeping";

// §10 audit_export ทุกวัน 02:00 (FR-AUDIT-02)
export const POST = jobRoute("audit_export", () => auditExport());
