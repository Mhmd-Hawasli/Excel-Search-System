import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const cairo = Cairo({ subsets: ["arabic"], display: "swap", variable: "--font-cairo" });

export const metadata: Metadata = {
  title: { default: "نظام أرشفة ملفات الإكسل", template: "%s | أرشيف الإكسل" },
  description: "نظام محلي لأرشفة ملفات البيانات العربية والبحث فيها وربط السجلات عبر الملفات.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={cairo.className}>
        <ThemeProvider>{children}<Toaster position="top-center" richColors dir="rtl" /></ThemeProvider>
      </body>
    </html>
  );
}
