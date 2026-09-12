"use client";

import { BarChart3, FileSpreadsheet, ListChecks, ScanSearch } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CONFLICT_CATEGORIES, CONFLICT_RULES } from "@/lib/conflicts-catalog";
import type { ConflictStats } from "@/services/conflicts.service";

const RULE_FILTER = new Map(CONFLICT_RULES.map((rule) => [rule.key, { category: rule.category, field: rule.field }]));

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span className="block h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <span
        className="block h-full rounded-full bg-primary"
        style={{ width: `${max === 0 ? 0 : Math.max(2, Math.round((value / max) * 100))}%` }}
      />
    </span>
  );
}

/**
 * Statistics dashboard for the conflicts section: archive totals plus bar
 * charts of the most frequent rules and files. Pure presentational.
 */
export function ConflictStats({ stats }: { stats: ConflictStats }) {
  const topRules = stats.rules.slice(0, 8);
  const topFiles = stats.files.slice(0, 8);
  const maxRule = topRules[0]?.instances ?? 0;
  const maxFile = topFiles[0]?.instances ?? 0;
  const summary = [
    { icon: FileSpreadsheet, label: "ملفات مفحوصة", value: stats.filesScanned },
    { icon: ScanSearch, label: "سجلات مفحوصة", value: stats.recordsScanned },
    { icon: ListChecks, label: "مشكلة ظاهرة", value: stats.instances },
    { icon: BarChart3, label: "مشكلة متجاهلة", value: stats.ignored },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map(({ icon: Icon, label, value }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-2xl font-black tabular-nums">
                  {value.toLocaleString("en-US")}
                </span>
                <span className="block text-xs text-muted-foreground">{label}</span>
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-base">أكثر القواعد تكراراً</CardTitle>
            <CardDescription>الحالات الأعلى عدداً في كامل الأرشيف — انقر أي حالة لعرض سجلاتها</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-2">
            {topRules.length === 0 && (
              <p className="text-sm text-muted-foreground">لا توجد مشاكل ظاهرة حالياً.</p>
            )}
            {topRules.map((entry) => (
              <div key={entry.rule} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  {(() => {
                    const filter = RULE_FILTER.get(entry.rule);
                    return filter ? (
                      <a
                        href={`/conflicts?category=${filter.category}&field=${filter.field}&rule=${entry.rule}`}
                        className="min-w-0 truncate font-semibold text-primary hover:underline"
                      >
                        {entry.label}
                      </a>
                    ) : (
                      <span className="min-w-0 truncate font-semibold">{entry.label}</span>
                    );
                  })()}
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {entry.instances.toLocaleString("en-US")}
                  </span>
                </div>
                <div className="flex items-center gap-2" dir="ltr">
                  <Bar value={entry.instances} max={maxRule} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-base">الملفات الأعلى مشاكل</CardTitle>
            <CardDescription>روابط مباشرة لصفحات الملفات</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-2">
            {topFiles.length === 0 && (
              <p className="text-sm text-muted-foreground">لا توجد مشاكل ظاهرة حالياً.</p>
            )}
            {topFiles.map((entry) => (
              <div key={entry.fileId} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <a
                    href={`/groups/${entry.groupId}/files/${entry.fileId}`}
                    className="min-w-0 truncate font-semibold text-primary hover:underline"
                  >
                    {entry.fileName}
                  </a>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {entry.instances.toLocaleString("en-US")}
                  </span>
                </div>
                <div className="flex items-center gap-2" dir="ltr">
                  <Bar value={entry.instances} max={maxFile} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">
        {CONFLICT_CATEGORIES.length} فئات رئيسية · الإحصائيات ضمن نطاق حسابك وتستبعد المشاكل المتجاهلة.
      </p>
    </div>
  );
}
