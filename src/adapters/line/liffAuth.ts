// §9.1 LIFF login: client ได้ ID token → เซิร์ฟเวอร์ verify กับ LINE → sub = line_user_id

export type LineIdentity = { lineUserId: string; name: string | null };

export async function verifyLiffIdToken(idToken: string, channelId = process.env.LINE_LOGIN_CHANNEL_ID): Promise<LineIdentity> {
  if (!channelId) throw new Error("LINE_LOGIN_CHANNEL_ID is not set");
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`LINE verify failed: ${res.status}`);
  const body = (await res.json()) as { sub?: string; name?: string };
  if (!body.sub) throw new Error("LINE verify: missing sub");
  return { lineUserId: body.sub, name: body.name ?? null };
}
