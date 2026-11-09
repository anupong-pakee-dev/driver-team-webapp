// ลิงก์เชิญคนขับ: เปิดผ่าน LIFF ถ้าตั้งค่าแล้ว ไม่งั้นเปิดหน้าเว็บตรง (local)
export function driverInviteLink(origin: string, token: string) {
  const liff = process.env.NEXT_PUBLIC_LIFF_ID_DRIVER;
  return liff ? `https://liff.line.me/${liff}/join?t=${token}` : `${origin}/liff/driver/join?t=${token}`;
}
