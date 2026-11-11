import type { MetadataRoute } from "next";

// ไอคอนตอน "เพิ่มไปหน้าจอหลัก" (Android/Chrome) — ไฟล์ภาพอยู่ใน public/
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Avera Taxi Thailand",
    short_name: "Avera Taxi",
    description: "Avera Taxi Thailand เหมารถพร้อมคนขับ รู้ราคาก่อนจอง",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f4ee",
    theme_color: "#f7f4ee",
    icons: [
      { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
