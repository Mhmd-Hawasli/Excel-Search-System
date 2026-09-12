"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Layers3, Plus, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { TypedDeleteButton } from "@/components/typed-delete-button";
import { CategoryColumnBoard } from "@/features/categories/category-column-board";
import { hasPermission } from "@/lib/permissions";
import { STANDARD_FIELD_LABELS, type StandardFieldKey } from "@/lib/standard-fields";
import type { MutationResult } from "@/lib/mutation";
import { ApiError } from "@/services/api-client";
import { authService } from "@/services/auth.service";
import {
  categoriesService,
  type BoardCategory,
  type Category,
  type CategoryOption,
} from "@/services/categories.service";

// Full UI-16 port (P6.1): create/edit/delete with source confirmations,
// seven-custom-plus-أخرى limit, category up/down ordering, grouped column
// board with drag/drop/keyboard reorder and per-column recategorize, delete
// returning columns to أخرى. Board group keys come from the server so the
// client and the reorder engine never disagree.

const MAX_CUSTOM_CATEGORIES = 7;
const MAX_TOTAL_CATEGORIES = MAX_CUSTOM_CATEGORIES + 1;
const LIMIT_MESSAGE = "الحد الأقصى هو 7 فئات مخصصة بالإضافة إلى فئة «أخرى».";

function noticeError(err: unknown, fallback: string): { kind: "error"; text: string } {
  return { kind: "error", text: err instanceof ApiError ? err.message : fallback };
}

function toSnake(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

export function CategoriesManager() {
  const [board, setBoard] = useState<BoardCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function load() {
    try {
      const [boardData, list, me] = await Promise.all([
        categoriesService.board(),
        categoriesService.list(),
        authService.me(),
      ]);
      setBoard(boardData);
      setCategories(list);
      setCanManage(hasPermission(me?.permissions ?? [], "categories.manage"));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذر تحميل الفئات.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // One-shot mount load (same pattern as use-api-query).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const totalCategories = categories.length + 1;
  const limitReached = categories.length >= MAX_CUSTOM_CATEGORIES;
  const categoryOptions: CategoryOption[] = [
    { id: null, name: "أخرى" },
    ...categories.map((category) => ({ id: category.id, name: category.name })),
  ];

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setNotice(null);
    try {
      await categoriesService.create(newName.trim());
      setNewName("");
      await load();
      setNotice({ kind: "ok", text: "تم إنشاء الفئة." });
    } catch (err) {
      setNotice(noticeError(err, "تعذر حفظ الفئة."));
    } finally {
      setCreating(false);
    }
  }

  async function rename(id: string, fallback: string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await categoriesService.update(id, (renames[id] ?? fallback).trim());
      await load();
      setNotice({ kind: "ok", text: "تم حفظ اسم الفئة." });
    } catch (err) {
      setNotice(noticeError(err, "تعذر حفظ الفئة."));
    } finally {
      setBusy(false);
    }
  }

  async function reorder(id: string, direction: "up" | "down") {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await categoriesService.reorder(id, direction);
      await load();
      setNotice({ kind: "ok", text: "تم حفظ ترتيب الفئات." });
    } catch (err) {
      setNotice(noticeError(err, "تعذر حفظ ترتيب الفئات."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(formData: FormData): Promise<MutationResult> {
    try {
      await categoriesService.remove(String(formData.get("id") ?? ""), String(formData.get("confirmName") ?? ""));
      await load();
      return { ok: true, message: "تم حذف الفئة ونُقلت أعمدتها إلى «أخرى»." };
    } catch (err) {
      return { ok: false, error: err instanceof ApiError ? err.message : "تعذر حذف الفئة." };
    }
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="إعدادات المشروع"
        title="فئات وأعمدة البيانات"
        description="أدر الفئات ورتّب أعمدة المشروع بالسحب والإفلات. الأعمدة المرتبطة بالحقل القياسي نفسه تظهر وتتحرك معًا."
      />
      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${notice.kind === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-primary/25 bg-primary/5 text-primary"}`}
        >
          {notice.text}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-muted-foreground">جارٍ التحميل…</p> : null}

      {!loading && !error ? (
        <>
          {canManage ? (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>إضافة فئة جديدة</CardTitle>
                    <CardDescription className="mt-1">
                      فئة «أخرى» ثابتة ومشمولة ضمن الحد الأقصى البالغ {MAX_TOTAL_CATEGORIES} فئات.
                    </CardDescription>
                  </div>
                  <Badge variant={limitReached ? "secondary" : "outline"}>
                    {totalCategories} من {MAX_TOTAL_CATEGORIES}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={(event) => void create(event)} className="flex flex-col gap-3 sm:flex-row">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="new-category">اسم الفئة</Label>
                    <Input
                      id="new-category"
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      placeholder="مثال: البيانات الوظيفية"
                      disabled={limitReached || creating}
                      required
                      minLength={2}
                      maxLength={100}
                    />
                  </div>
                  <Button type="submit" className="self-end" disabled={limitReached || creating}>
                    <Plus className="size-4" />
                    إضافة الفئة
                  </Button>
                </form>
                {limitReached ? (
                  <p className="mt-3 text-sm font-semibold text-muted-foreground">{LIMIT_MESSAGE}</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">جميع فئات المشروع</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  اضغط على أي فئة، ثم اسحب البنود لتغيير ترتيب العرض أو انقل عمودًا إلى فئة أخرى.
                </p>
              </div>
              <Badge variant="secondary" className="gap-1">
                <Layers3 className="size-3.5" />
                {board.reduce((total, category) => total + category.groups.reduce((sum, group) => sum + group.columns.length, 0), 0)} عمود
              </Badge>
            </div>

            {board.length === 0 ? (
              <EmptyState title="لا توجد فئات" description="أضف فئة جديدة للبدء." />
            ) : (
              board.map((category) => {
                const categoryKey = category.categoryId ?? "other";
                const columns = category.groups.flatMap((group) => group.columns);
                const files = new Set(columns.map((column) => column.fileId)).size;
                const customIndex = categories.findIndex((item) => item.id === category.categoryId);
                return (
                  <details key={categoryKey} className="group overflow-hidden rounded-xl border bg-card shadow-sm">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 transition hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-black">{category.categoryName}</h3>
                          {category.categoryId === null ? <Badge>افتراضية</Badge> : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant="secondary">{columns.length} عمود</Badge>
                          <Badge variant="outline">{files} ملف</Badge>
                        </div>
                      </div>
                      <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>

                    <div className="border-t">
                      {category.categoryId ? (
                        canManage ? (
                          <div className="flex flex-col justify-between gap-3 bg-muted/25 p-4 lg:flex-row lg:items-end">
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                void rename(category.categoryId!, category.categoryName);
                              }}
                              className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end"
                            >
                              <div className="flex-1 space-y-1">
                                <Label htmlFor={`category-${category.categoryId}`}>اسم الفئة</Label>
                                <Input
                                  id={`category-${category.categoryId}`}
                                  value={renames[category.categoryId!] ?? category.categoryName}
                                  onChange={(event) =>
                                    setRenames((current) => ({ ...current, [category.categoryId!]: event.target.value }))
                                  }
                                  minLength={2}
                                  maxLength={100}
                                />
                              </div>
                              <Button type="submit" variant="secondary" size="sm" disabled={busy}>
                                <Save className="size-4" />
                                حفظ الاسم
                              </Button>
                            </form>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                disabled={busy || customIndex === 0}
                                aria-label="نقل الفئة إلى الأعلى"
                                onClick={() => void reorder(category.categoryId!, "up")}
                              >
                                <ArrowUp className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                disabled={busy || customIndex === categories.length - 1}
                                aria-label="نقل الفئة إلى الأسفل"
                                onClick={() => void reorder(category.categoryId!, "down")}
                              >
                                <ArrowDown className="size-4" />
                              </Button>
                              <TypedDeleteButton
                                id={category.categoryId!}
                                entityName={category.categoryName}
                                description={`سيُنقل ${columns.length} عمود في ${files} ملف إلى فئة «أخرى». الأعمدة المرتبطة بحقول قياسية موجودة ستنضم إلى مجموعاتها، والبقية ستُضاف في نهاية القائمة. لن تُحذف أي بيانات.`}
                                action={deleteCategory}
                                onSuccess={() => setNotice({ kind: "ok", text: "تم حذف الفئة ونُقلت أعمدتها إلى «أخرى»." })}
                              />
                            </div>
                          </div>
                        ) : null
                      ) : (
                        <p className="bg-muted/25 px-5 py-3 text-sm text-muted-foreground">
                          لا يمكن حذف هذه الفئة. تستقبل تلقائيًا الأعمدة غير المصنفة وأعمدة الفئات المحذوفة.
                        </p>
                      )}

                      {canManage ? (
                        <CategoryColumnBoard
                          categoryId={category.categoryId}
                          groups={category.groups.map((group) => ({
                            key: group.key,
                            label: group.label,
                            standardFieldLabel:
                              group.standardField === null
                                ? null
                                : (STANDARD_FIELD_LABELS[toSnake(group.standardField) as StandardFieldKey] ?? null),
                            columns: group.columns,
                          }))}
                          categoryOptions={categoryOptions}
                          onChanged={() => void load()}
                        />
                      ) : (
                        <div className="space-y-3 p-4">
                          {category.groups.map((group) => (
                            <div key={group.key} className="rounded-lg border p-3">
                              <p className="text-sm font-bold">{group.label}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {group.columns.map((column) => (
                                  <span key={column.id} className="rounded-md bg-muted px-2 py-1 text-xs">
                                    {column.headerRaw}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                );
              })
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
