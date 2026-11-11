import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BizError } from "@/lib/errors";

// §5.4 private buckets — อัปโหลด/อ่านผ่านเซิร์ฟเวอร์ด้วย service role เท่านั้น · ลิงก์อ่าน = signed URL ≤ 10 นาที

export type Bucket = "kyc-docs" | "checkins" | "receipts" | "public-assets";

let client: SupabaseClient | undefined;
function sb() {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export const ALLOWED_UPLOAD = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" } as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** ตรวจ magic bytes ให้ตรงกับชนิดที่อ้าง — ไม่เชื่อ Content-Type จากเบราว์เซอร์ (§13.1) */
export function sniffMatches(body: ArrayBuffer, contentType: string): boolean {
  const b = new Uint8Array(body.slice(0, 12));
  const ascii = (from: number, s: string) => [...s].every((c, i) => b[from + i] === c.charCodeAt(0));
  switch (contentType) {
    case "image/jpeg": return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/png": return b[0] === 0x89 && ascii(1, "PNG");
    case "image/webp": return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "application/pdf": return ascii(0, "%PDF");
    default: return false;
  }
}

export async function upload(bucket: Bucket, path: string, body: ArrayBuffer, contentType: string) {
  if (!sniffMatches(body, contentType)) throw new BizError("VALIDATION", { file: "type" });
  const { error } = await sb().storage.from(bucket).upload(path, body, { contentType, upsert: false });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
}

/** ลบไฟล์ (เช่น เอกสารของคนขับที่ถูกลบ) — ไฟล์ที่ไม่มีอยู่แล้วไม่ถือว่าผิดพลาด */
export async function remove(bucket: Bucket, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await sb().storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw new Error(`storage remove failed: ${error.message}`);
  }
}

export async function signedUrl(bucket: Bucket, path: string, seconds = 600): Promise<string> {
  const { data, error } = await sb().storage.from(bucket).createSignedUrl(path, Math.min(seconds, 600));
  if (error || !data) throw new Error(`signed url failed: ${error?.message}`);
  return data.signedUrl;
}
