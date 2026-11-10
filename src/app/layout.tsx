import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import { HTML_LANG, messages } from "@/i18n";
import { getLocale } from "@/lib/locale";
import "./globals.css";

const thai = IBM_Plex_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = messages(await getLocale());
  return {
    title: { default: `Avera Taxi Thailand · ${t.catalog.headline1}`, template: "%s · Avera Taxi Thailand" },
    description: `Avera Taxi Thailand ${t.catalog.headline1} · ${t.catalog.headline2} · ${t.catalog.trust}`,
    applicationName: "Avera Taxi Thailand",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#13294b",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // lang ตามภาษาฝั่งลูกค้า (ให้เบราว์เซอร์เลือกฟอนต์/ตัวอ่านหน้าจอถูก) · หลังบ้าน/คนขับเป็นไทยเสมอแต่ไม่กระทบการแสดงผล
  const locale = await getLocale();
  return (
    <html lang={HTML_LANG[locale]} className={`${thai.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
