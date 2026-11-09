import { CookieConsent } from "@/components/CookieConsent";

// หน้าสาธารณะ (แคตตาล็อก, landing, privacy): แบนเนอร์คุกกี้ (FR-PDPA-05)
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CookieConsent pixelId={process.env.NEXT_PUBLIC_META_PIXEL_ID} />
    </>
  );
}
