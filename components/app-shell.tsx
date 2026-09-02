import Link from "next/link";
import {
  Archive,
  DatabaseBackup,
  FileSpreadsheet,
  FolderKanban,
  History,
  LogOut,
  Search,
  Settings,
  ScanSearch,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/", label: "الرئيسية", icon: Archive },
  { href: "/search", label: "البحث", icon: Search },
  { href: "/conflicts", label: "تضارب البيانات", icon: ScanSearch },
  { href: "/groups", label: "المجموعات", icon: FolderKanban },
  { href: "/upload", label: "رفع ملف", icon: FileSpreadsheet },
  { href: "/settings/categories", label: "الفئات", icon: Settings },
  { href: "/settings/backup", label: "النسخ الاحتياطي", icon: DatabaseBackup },
  { href: "/logs", label: "سجل النشاط", icon: History },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3 font-bold">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Archive className="size-5" />
            </span>
            <span className="hidden truncate sm:block">أرشيف الإكسل</span>
          </Link>
          <nav className="hidden items-center gap-1 xl:flex" aria-label="التنقل الرئيسي">
            {links.map(({ href, label, icon: Icon }) => (
              <Button key={href} asChild variant="ghost" size="sm">
                <Link href={href}>
                  <Icon className="size-4" />
                  {label}
                </Link>
              </Button>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <form action="/api/auth/logout" method="post">
              <Button type="submit" variant="ghost" size="icon" aria-label="تسجيل الخروج">
                <LogOut className="size-5" />
              </Button>
            </form>
          </div>
        </div>
        <nav
          className="container flex gap-1 overflow-x-auto pb-2 xl:hidden"
          aria-label="التنقل الرئيسي للهاتف"
        >
          {links.map(({ href, label, icon: Icon }) => (
            <Button key={href} asChild variant="ghost" size="sm" className="shrink-0">
              <Link href={href}>
                <Icon className="size-4" />
                {label}
              </Link>
            </Button>
          ))}
        </nav>
      </header>
      <main className="container py-8 md:py-10">{children}</main>
    </div>
  );
}
