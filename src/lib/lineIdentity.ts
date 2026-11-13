import "server-only";
import { verifyLiffIdToken, type LineIdentity } from "@/adapters/line/liffAuth";
import { devLoginEnabled } from "./dev";
import { BizError } from "./errors";

/** ตรวจ ID token จาก LIFF → LINE user id · local: จำลองด้วย "dev:<line_user_id>" (ปิดใน production) */
export async function identifyLine(idToken: string): Promise<LineIdentity> {
  if (devLoginEnabled() && idToken.startsWith("dev:")) return { lineUserId: idToken.slice(4), name: null };
  try {
    return await verifyLiffIdToken(idToken);
  } catch {
    throw new BizError("UNAUTHENTICATED");
  }
}
