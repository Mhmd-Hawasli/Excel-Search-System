import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "نظام أرشفة ملفات الإكسل",
  description: "أرشفة والبحث في ملفات الإكسل",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
