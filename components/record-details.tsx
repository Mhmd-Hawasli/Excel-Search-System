"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Eye, EyeOff, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatStoredDate } from "@/lib/format/date";
import { formatShamCash } from "@/lib/format/sham-cash";
import { formatNationalId } from "@/lib/format/national-id";
import { matchesNormalizedText } from "@/lib/normalization/arabic";
import type { StandardFieldKey } from "@/lib/excel/types";

type DetailColumn = {
  id: string;
  headerRaw: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryOrder: number | null;
  standardField: StandardFieldKey | null;
  value: string;
};

export function RecordDetails({ columns }: { columns: DetailColumn[] }) {
  const [hideEmpty, setHideEmpty] = useState(false);
  const [columnQuery, setColumnQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const groups = useMemo(() => {
    const byKey = new Map<
      string,
      { key: string; name: string; order: number; columns: DetailColumn[] }
    >();
    for (const column of columns) {
      const key = column.categoryId ?? "other";
      const group = byKey.get(key) ?? {
        key,
        name: column.categoryName ?? "أخرى",
        order: column.categoryOrder ?? Number.MAX_SAFE_INTEGER,
        columns: [],
      };
      group.columns.push(column);
      byKey.set(key, group);
    }
    return Array.from(byKey.values()).sort((a, b) => a.order - b.order);
  }, [columns]);
  const hasQuery = Boolean(columnQuery.trim());
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      columns: group.columns.filter(
        (column) =>
          (!hideEmpty || Boolean(column.value.trim())) &&
          (!hasQuery || matchesNormalizedText(columnQuery, column.headerRaw)),
      ),
    }))
    .filter((group) => !hasQuery || group.columns.length > 0);
  const activeGroup =
    visibleGroups.find((group) => group.key === selectedGroup)?.key ?? visibleGroups[0]?.key;

  async function copy(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    toast.success("تم نسخ القيمة.");
    window.setTimeout(() => setCopied(null), 1200);
  }
  if (!groups.length)
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        لا توجد أعمدة محفوظة لهذا السجل.
      </p>
    );
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={columnQuery}
            onChange={(event) => setColumnQuery(event.target.value)}
            placeholder="بحث باسم العمود…"
            aria-label="بحث باسم العمود في جميع التبويبات"
            className="h-9 pr-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={hideEmpty}
          onClick={() => setHideEmpty((current) => !current)}
        >
          {hideEmpty ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          {hideEmpty ? "إظهار الحقول الفارغة" : "إخفاء الحقول الفارغة"}
        </Button>
      </div>
      {visibleGroups.length === 0 ? (
        <p
          role="status"
          className="rounded-lg border border-dashed p-8 text-center text-muted-foreground"
        >
          {hideEmpty
            ? "لا توجد أعمدة مطابقة ضمن الحقول غير الفارغة."
            : "لا توجد أعمدة مطابقة لاسم البحث."}
        </p>
      ) : (
        <Tabs value={activeGroup} onValueChange={setSelectedGroup} dir="rtl">
          <div className="overflow-x-auto">
            <TabsList>
              {visibleGroups.map((group) => (
                <TabsTrigger key={group.key} value={group.key}>
                  {group.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {visibleGroups.map((group) => {
            const visible = group.columns;
            return (
              <TabsContent key={group.key} value={group.key}>
                {visible.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                    كل حقول هذا التبويب فارغة.
                  </p>
                ) : (
                  <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {visible.map((column) => {
                      const displayValue =
                        column.standardField === "sham_cash"
                          ? formatShamCash(column.value)
                          : column.standardField === "national_id"
                            ? formatNationalId(column.value)
                            : formatStoredDate(column.value);
                      return (
                        <div key={column.id} className="group rounded-xl border bg-card p-4">
                          <dt className="text-xs font-bold text-muted-foreground">
                            {column.headerRaw}
                          </dt>
                          <dd className="mt-2 flex min-h-8 items-start justify-between gap-3">
                            <span className="break-words text-sm font-semibold ltr-numbers text-right">
                              {displayValue || "—"}
                            </span>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 shrink-0 opacity-60 group-hover:opacity-100"
                              onClick={() => void copy(column.id, displayValue)}
                              disabled={!column.value}
                              aria-label={`نسخ ${column.headerRaw}`}
                            >
                              {copied === column.id ? (
                                <Check className="size-4 text-primary" />
                              ) : (
                                <Copy className="size-4" />
                              )}
                            </Button>
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}
