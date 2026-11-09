import { REASON_TH } from "@/domain/documents";
import { Badge } from "./ui";

// FR-VEH-04: แสดงเหตุผลที่ไม่ eligible
export function Reasons({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return <Badge tone="ok">รับงานได้</Badge>;
  return (
    <ul className="flex flex-wrap gap-1">
      {reasons.map((r) => (
        <li key={r}><Badge tone="bad">{REASON_TH[r] ?? r}</Badge></li>
      ))}
    </ul>
  );
}
