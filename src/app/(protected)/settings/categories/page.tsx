import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Layers3,
  Plus,
  Save,
} from "lucide-react";
import {
  createCategory,
  deleteCategory,
  reorderCategory,
  updateCategory,
} from "@/lib/actions/categories";
import {
  CATEGORY_LIMIT_MESSAGE,
  MAX_CUSTOM_CATEGORIES,
  MAX_TOTAL_CATEGORIES,
} from "@/lib/categories/config";
import { prisma } from "@/lib/db/prisma";
import { STANDARD_FIELD_LABELS } from "@/lib/excel/standard-fields";
import type { StandardFieldKey } from "@/lib/excel/types";
import {
  CategoryColumnBoard,
  type CategoryBoardGroup,
} from "@/features/categories/category-column-board";
import { MutationForm } from "@/components/mutation-form";
import { PageHeader } from "@/components/page-header";
import { TypedDeleteButton } from "@/components/typed-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

type PageColumn = {
  id: string;
  headerRaw: string;
  columnIndex: number;
  standardField: string | null;
  file: { name: string; group: { name: string } };
};

function groupColumns(columns: PageColumn[]) {
  const groups = new Map<string, CategoryBoardGroup>();
  for (const column of columns) {
    const standardField = column.standardField?.toLowerCase() as StandardFieldKey | undefined;
    const key = standardField ? `standard:${standardField}` : `column:${column.id}`;
    const standardFieldLabel = standardField ? STANDARD_FIELD_LABELS[standardField] : null;
    const group = groups.get(key) ?? {
      key,
      label: standardFieldLabel ?? column.headerRaw,
      standardFieldLabel,
      columns: [],
    };
    group.columns.push({
      id: column.id,
      headerRaw: column.headerRaw,
      columnIndex: column.columnIndex,
      fileName: column.file.name,
      groupName: column.file.group.name,
    });
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

export default async function CategoriesPage() {
  const [categories, otherColumns] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        columns: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { columnIndex: "asc" }],
          include: { file: { select: { name: true, group: { select: { name: true } } } } },
        },
      },
    }),
    prisma.fileColumn.findMany({
      where: { categoryId: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { columnIndex: "asc" }],
      include: { file: { select: { name: true, group: { select: { name: true } } } } },
    }),
  ]);

  const totalCategories = categories.length + 1;
  const limitReached = categories.length >= MAX_CUSTOM_CATEGORIES;
  const categoryOptions = [
    { id: null, name: "أخرى" },
    ...categories.map((category) => ({ id: category.id, name: category.name })),
  ];
  const categoryViews = [
    { id: null, name: "أخرى", columns: otherColumns },
    ...categories.map((category) => ({ id: category.id, name: category.name, columns: category.columns })),
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="إعدادات المشروع"
        title="فئات وأعمدة البيانات"
        description="أدر الفئات ورتّب أعمدة المشروع بالسحب والإفلات. الأعمدة المرتبطة بالحقل القياسي نفسه تظهر وتتحرك معًا."
      />
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
          <MutationForm action={createCategory} resetOnSuccess pendingMessage="جارٍ إنشاء الفئة…" className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 space-y-2">
              <Label htmlFor="new-category">اسم الفئة</Label>
              <Input
                id="new-category"
                name="name"
                placeholder="مثال: البيانات الوظيفية"
                disabled={limitReached}
                required
              />
            </div>
            <Button type="submit" className="self-end" disabled={limitReached}>
              <Plus className="size-4" />
              إضافة الفئة
            </Button>
          </MutationForm>
          {limitReached ? (
            <p className="mt-3 text-sm font-semibold text-muted-foreground">{CATEGORY_LIMIT_MESSAGE}</p>
          ) : null}
        </CardContent>
      </Card>

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
            {categoryViews.reduce((total, category) => total + category.columns.length, 0)} عمود
          </Badge>
        </div>

        {categoryViews.map((category, categoryIndex) => {
          const categoryKey = category.id ?? "other";
          const customIndex = categoryIndex - 1;
          const files = new Set(category.columns.map((column) => column.fileId)).size;
          const groupedColumns = groupColumns(category.columns);
          return (
            <details
              key={categoryKey}
              className="group overflow-hidden rounded-xl border bg-card shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 transition hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-lg font-black">{category.name}</h3>
                    {category.id === null ? <Badge>افتراضية</Badge> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="secondary">{category.columns.length} عمود</Badge>
                    <Badge variant="outline">{files} ملف</Badge>
                  </div>
                </div>
                <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>

              <div className="border-t">
                {category.id ? (
                  <div className="flex flex-col justify-between gap-3 bg-muted/25 p-4 lg:flex-row lg:items-end">
                    <MutationForm action={updateCategory} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                      <input type="hidden" name="id" value={category.id} />
                      <input type="hidden" name="openCategory" value={category.id} />
                      <div className="flex-1 space-y-1">
                        <Label htmlFor={`category-${category.id}`}>اسم الفئة</Label>
                        <Input id={`category-${category.id}`} name="name" defaultValue={category.name} />
                      </div>
                      <Button type="submit" variant="secondary" size="sm">
                        <Save className="size-4" />
                        حفظ الاسم
                      </Button>
                    </MutationForm>
                    <div className="flex flex-wrap items-center gap-2">
                      <MutationForm action={reorderCategory} pendingMessage="جارٍ حفظ ترتيب الفئات…">
                        <input type="hidden" name="id" value={category.id} />
                        <input type="hidden" name="direction" value="up" />
                        <input type="hidden" name="openCategory" value={category.id} />
                        <Button type="submit" size="icon" variant="outline" disabled={customIndex === 0} aria-label="نقل الفئة إلى الأعلى">
                          <ArrowUp className="size-4" />
                        </Button>
                      </MutationForm>
                      <MutationForm action={reorderCategory} pendingMessage="جارٍ حفظ ترتيب الفئات…">
                        <input type="hidden" name="id" value={category.id} />
                        <input type="hidden" name="direction" value="down" />
                        <input type="hidden" name="openCategory" value={category.id} />
                        <Button type="submit" size="icon" variant="outline" disabled={customIndex === categories.length - 1} aria-label="نقل الفئة إلى الأسفل">
                          <ArrowDown className="size-4" />
                        </Button>
                      </MutationForm>
                      <TypedDeleteButton
                        id={category.id}
                        entityName={category.name}
                        description={`سيُنقل ${category.columns.length} عمود في ${files} ملف إلى فئة «أخرى». الأعمدة المرتبطة بحقول قياسية موجودة ستنضم إلى مجموعاتها، والبقية ستُضاف في نهاية القائمة. لن تُحذف أي بيانات.`}
                        action={deleteCategory}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="bg-muted/25 px-5 py-3 text-sm text-muted-foreground">
                    لا يمكن حذف هذه الفئة. تستقبل تلقائيًا الأعمدة غير المصنفة وأعمدة الفئات المحذوفة.
                  </p>
                )}

                <CategoryColumnBoard
                  categoryId={category.id}
                  groups={groupedColumns}
                  categoryOptions={categoryOptions}
                />
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}
