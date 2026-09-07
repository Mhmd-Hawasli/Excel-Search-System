import type { ReactNode } from "react";
import Link from "next/link";
import { FileSpreadsheet, FolderKanban, LogOut, Search, Settings2, Upload } from "lucide-react";
import { AuthGuard } from "@/features/auth/auth-guard";

const links = [
  { href: "/", label: "لوحة التحكم", icon: FileSpreadsheet },
  { href: "/groups", label: "المجموعات", icon: FolderKanban },
  { href: "/search", label: "البحث", icon: Search },
  { href: "/upload", label: "رفع ملف", icon: Upload },
  { href: "/settings/users", label: "الإعدادات", icon: Settings2 },
];

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">
            <FileSpreadsheet className="size-5" />
          </span>
          <span className="font-bold">أرشيف الإكسل</span>
        </div>
        <nav className="sidebar-navigation">
          <div className="sidebar-section">
            <div className="sidebar-section-title">القائمة</div>
            {links.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="sidebar-link">
                <Icon className="size-[18px]" />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </nav>
        <div className="p-3">
          <Link href="/login" className="sidebar-link">
            <LogOut className="size-[18px]" />
            <span>تسجيل الخروج</span>
          </Link>
        </div>
      </aside>
      <main className="min-h-screen pr-[252px] p-6" style={{ paddingInlineStart: "252px" }}>
        {children}
      </main>
    </div>
    </AuthGuard>
  );
}
