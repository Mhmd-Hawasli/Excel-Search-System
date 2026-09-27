"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/cn";

export function DataTableViewport({
  children,
  className,
  label = "جدول بيانات",
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground md:hidden" aria-hidden="true">
        اسحب أفقيًا لعرض باقي الأعمدة
      </p>
      <div
        tabIndex={0}
        role="region"
        aria-label={label}
        className={cn(
          "overflow-x-auto rounded-xl border bg-card focus-visible:outline-2 focus-visible:outline-primary",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function SortableTableHeader({
  label,
  active,
  direction,
  onSort,
  className,
}: {
  label: string;
  active: boolean;
  direction?: string;
  onSort: () => void;
  className?: string;
}) {
  const nextDirection = active && direction === "asc" ? "تنازلي" : "تصاعدي";
  return (
    <th scope="col" className="p-0 text-right font-bold" aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={onSort}
        className={cn("group flex w-full items-center gap-2 p-3 text-right transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary", active && "bg-primary/5 text-primary", className)}
        aria-label={`فرز حسب ${label} ${nextDirection}`}
      >
        <span>{label}</span>
        {active ? (
          direction === "asc" ? <ArrowUp className="size-4 shrink-0" aria-hidden="true" /> : <ArrowDown className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          <ArrowUpDown className="size-4 shrink-0 text-muted-foreground/60 transition group-hover:text-foreground" aria-hidden="true" />
        )}
      </button>
    </th>
  );
}
