"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Archive,
  ChevronLeft,
  DatabaseBackup,
  Download,
  FileUp,
  FolderKanban,
  History,
  LayoutDashboard,
  Layers,
  LogOut,
  Merge,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Settings2,
  ScanSearch,
  UserRound,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const navigation = [
  {
    label: "مساحة العمل",
    links: [
      { href: "/", label: "الرئيسية", icon: LayoutDashboard },
      { href: "/search", label: "البحث", icon: Search },
      { href: "/groups", label: "المجموعات", icon: FolderKanban },
      { href: "/settings/categories", label: "الفئات", icon: Settings2 },
      { href: "/conflicts", label: "تضارب البيانات", icon: ScanSearch },
    ],
  },
  {
    label: "استيراد وتصدير",
    links: [
      { href: "/upload", label: "رفع ملف", icon: FileUp },
      { href: "/edits", label: "تصدير ملفات الإكسل", icon: Download },
    ],
  },
  {
    label: "أدوات الدمج",
    links: [
      { href: "/merge", label: "دمج ملفات", icon: Merge },
      { href: "/merge-sheets", label: "دمج صفحات ملف إكسل", icon: Layers },
    ],
  },
  {
    label: "إدارة النظام",
    links: [
      { href: "/settings/backup", label: "النسخ الاحتياطي", icon: DatabaseBackup },
      { href: "/logs", label: "سجل النشاط", icon: History },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      <Link
        href="/"
        className="sidebar-brand"
        onClick={onNavigate}
        aria-label="أرشيف الإكسل — الرئيسية"
      >
        <span className="brand-mark">
          <Archive className="size-5" aria-hidden="true" />
        </span>
        <span className="sidebar-label min-w-0">
          <span className="block text-base font-extrabold">أرشيف الإكسل</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            إدارة البيانات والملفات
          </span>
        </span>
      </Link>
      <nav className="sidebar-navigation" aria-label="التنقل الرئيسي">
        {navigation.map((section) => (
          <div className="sidebar-section" key={section.label}>
            <p className="sidebar-section-title">
              <span>{section.label}</span>
            </p>
            <div className="space-y-1">
              {section.links.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="sidebar-link"
                  aria-current={isActive(pathname, href) ? "page" : undefined}
                  aria-label={label}
                  title={label}
                  onClick={onNavigate}
                >
                  <Icon className="size-[19px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
                  <span className="sidebar-label">{label}</span>
                  {isActive(pathname, href) && (
                    <span className="sidebar-active-dot sidebar-label" />
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="sidebar-account">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
          <UserRound className="size-[18px]" aria-hidden="true" />
        </span>
        <div className="sidebar-label">
          <p className="text-sm font-bold">مسؤول الأرشيف</p>
          <p className="mt-0.5 text-xs text-muted-foreground">مساحة العمل المحلية</p>
        </div>
      </div>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const currentSection = navigation.find((section) =>
    section.links.some((link) => isActive(pathname, link.href)),
  );
  const currentPage =
    currentSection?.links.find((link) => isActive(pathname, link.href))?.label ?? "تفاصيل السجل";

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("archive-sidebar-collapsed") === "true");
    } catch {
      /* Storage is optional. */
    }
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeDrawer = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    document.addEventListener("keydown", shortcut);
    desktop.addEventListener("change", closeDrawer);
    return () => {
      document.removeEventListener("keydown", shortcut);
      desktop.removeEventListener("change", closeDrawer);
    };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("archive-sidebar-collapsed", String(next));
    } catch {
      /* Keep the toggle usable without storage. */
    }
  }

  return (
    <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
      <div className="dashboard-shell" data-collapsed={collapsed}>
        <a href="#main-content" className="skip-link">
          الانتقال إلى المحتوى
        </a>
        <aside id="desktop-sidebar" className="dashboard-sidebar">
          <SidebarContent pathname={pathname} />
        </aside>
        <div className="dashboard-workspace">
          <header className="dashboard-topbar">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="hidden shrink-0 lg:inline-flex"
                onClick={toggleSidebar}
                aria-label={collapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية"}
                aria-expanded={!collapsed}
                aria-controls="desktop-sidebar"
                title={collapsed ? "توسيع القائمة" : "طي القائمة"}
              >
                {collapsed ? (
                  <PanelRightOpen className="size-5" />
                ) : (
                  <PanelRightClose className="size-5" />
                )}
              </Button>
              <Dialog.Trigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 lg:hidden"
                  aria-label="إظهار القائمة الجانبية"
                >
                  <PanelRightOpen className="size-5" />
                </Button>
              </Dialog.Trigger>
              <div className="topbar-breadcrumb" aria-label="الموقع الحالي">
                <span className="hidden text-muted-foreground xl:inline">
                  {currentSection?.label ?? "الأرشيف"}
                </span>
                <ChevronLeft
                  className="hidden size-3.5 text-muted-foreground xl:block"
                  aria-hidden="true"
                />
                <span className="truncate font-semibold">{currentPage}</span>
              </div>
            </div>
            <form action="/search" role="search" className="global-search">
              <Search className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                name="q"
                aria-label="البحث العام في جميع السجلات"
                placeholder="ابحث بالاسم، الرقم الوطني أو الهاتف…"
                autoComplete="off"
              />
              <kbd
                className="hidden shrink-0 rounded border bg-card px-1.5 py-0.5 text-xs text-muted-foreground sm:block"
                dir="ltr"
              >
                Ctrl K
              </kbd>
              <button
                type="submit"
                className="search-submit"
                aria-label="تنفيذ البحث العام"
                title="بحث"
              >
                <ChevronLeft className="size-4" />
              </button>
            </form>
            <div className="topbar-actions">
              <ThemeToggle />
              <span className="h-5 w-px bg-border" aria-hidden="true" />
              <form action="/api/auth/logout" method="post">
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  aria-label="تسجيل الخروج"
                  title="تسجيل الخروج"
                >
                  <LogOut className="size-[18px]" />
                </Button>
              </form>
            </div>
          </header>
          <main id="main-content" tabIndex={-1} className="dashboard-main">
            {children}
          </main>
          <footer className="dashboard-footer">
            <span>أرشيف الإكسل</span>
            <span>تنظيم أفضل، وصول أسرع</span>
          </footer>
        </div>
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm" />
        <Dialog.Content className="mobile-sidebar" dir="rtl" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">القائمة الرئيسية</Dialog.Title>
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-3 top-5"
              aria-label="إخفاء القائمة الجانبية"
            >
              <X className="size-5" />
            </Button>
          </Dialog.Close>
          <SidebarContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
