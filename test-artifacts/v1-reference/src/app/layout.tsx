import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

/**
 * Cairo variable font, self-hosted (Arabic + Latin subsets) so builds never
 * depend on Google's CDN and no font request leaves the server.
 */
const cairo = localFont({
  src: [
    { path: "./fonts/cairo-arabic-wght-normal.woff2", weight: "200 1000", style: "normal" },
    { path: "./fonts/cairo-latin-wght-normal.woff2", weight: "200 1000", style: "normal" },
  ],
  display: "swap",
  variable: "--font-cairo",
});

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
