"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileCheck2, FileWarning, LoaderCircle, RefreshCw, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import type { SheetInspection, WorkbookInspection } from "@/types/model";
import { STANDARD_FIELD_KEYS, type StandardFieldKey } from "@/lib/standard-fields";
import { STANDARD_FIELD_LABELS } from "@/lib/standard-fields";
import { ensureUniqueStandardFields } from "@/lib/standard-fields";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CategorySelector } from "@/features/categories/category-selector";
import { FieldMappingSelect } from "@/features/fields/field-mapping-select";
import { WorkbookSheetSelector } from "@/features/upload/workbook-sheet-selector";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useUploadJobPolling } from "@/hooks/use-upload-job-polling";
import { ApiError } from "@/services/api-client";
import { uploadService } from "@/services/upload.service";

type ExistingColumn = {
  headerRaw: string;
  headerNormalized: string;
  columnIndex: number;
  standardField: StandardFieldKey | null;
  categoryId: string | null;
};
type MappedColumn = SheetInspection["columns"][number] & {
  standardField: StandardFieldKey | null;
  categoryId: string | null;
};

export function FileUpdateWizard({
  fileId,
  groupId,
  fileName,
  currentRows,
  existingColumns,
  categories,
}: {
  fileId: string;
  groupId: string;
  fileName: string;
  currentRows: number;
  existingColumns: ExistingColumn[];
  categories: { id: string; name: string }[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<WorkbookInspection | null>(null);
  const [sheet, setSheet] = useState<SheetInspection | null>(null);
  const [columns, setColumns] = useState<MappedColumn[]>([]);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useUploadJobPolling({
    doneMessage: "تم حفظ الإصدار الجديد واستبدال بيانات الملف بنجاح.",
    failedFallbackMessage: "فشل تحديث الملف وبقيت البيانات السابقة محفوظة.",
  });

  function applySheet(next: SheetInspection | null) {
    setSheet(next);
    if (!next) {
      setColumns([]);
      return;
    }
    setColumns(
      ensureUniqueStandardFields(
        next.columns.map((column) => {
          const old = existingColumns.find(
            (item) => item.headerNormalized === column.headerNormalized,
          );
          return {
            ...column,
            standardField: old?.standardField ?? column.suggestedField,
            categoryId: old?.categoryId ?? null,
          };
        }),
        next.linkedSheets?.nationalIdColumnIndex,
      ),
    );
  }
  const identical = useMemo(
    () =>
      Boolean(
        sheet &&
          existingColumns.length === sheet.columns.length &&
          existingColumns.every(
            (column, index) => column.headerNormalized === sheet.columns[index]?.headerNormalized,
          ),
      ),
    [sheet, existingColumns],
  );
  const diff = useMemo(() => {
    if (!sheet) return { added: [] as string[], removed: [] as string[], renamed: [] as string[] };
    const oldSet = new Set(existingColumns.map((column) => column.headerNormalized));
    const newSet = new Set(sheet.columns.map((column) => column.headerNormalized));
    return {
      added: sheet.columns
        .filter((column) => !oldSet.has(column.headerNormalized))
        .map((column) => column.headerRaw),
      removed: existingColumns
        .filter((column) => !newSet.has(column.headerNormalized))
        .map((column) => column.headerRaw),
      renamed: existingColumns
        .map((old, index) => ({
          old: old.headerRaw,
          next: sheet.columns[index]?.headerRaw,
          changed: Boolean(
            sheet.columns[index] && old.headerNormalized !== sheet.columns[index].headerNormalized,
          ),
        }))
        .filter((item) => item.changed)
        .map((item) => `${item.old} ← ${item.next}`),
    };
  }, [sheet, existingColumns]);

  async function inspect() {
    if (!file) return;
    setBusy(true);
    try {
      const result = await uploadService.inspect(file);
      setInspection(result);
      applySheet(result.selected);
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "تعذر فحص الملف.");
    } finally {
      setBusy(false);
    }
  }
  function updateColumn(
    index: number,
    patch: Partial<Pick<MappedColumn, "standardField" | "categoryId">>,
  ) {
    setColumns((current) =>
      current.map((column, itemIndex) => (itemIndex === index ? { ...column, ...patch } : column)),
    );
  }
  async function start() {
    if (!inspection || !sheet) return;
    setBusy(true);
    try {
      const { jobId } = await uploadService.replace(fileId, {
        mode: identical ? "same" : "different",
        token: inspection.token,
        originalFilename: inspection.originalFilename,
        sheetName: sheet.sheetName,
        sheetIndex: sheet.sheetIndex,
        totalRows: sheet.rowCount,
        linkedSheets: sheet.linkedSheets ?? undefined,
        columns: columns.map(
          ({ headerRaw, headerNormalized, columnIndex, standardField, categoryId }) => ({
            headerRaw,
            headerNormalized,
            columnIndex,
            standardField,
            categoryId,
          }),
        ),
      });
      setJob({
        id: jobId,
        fileId: null,
        status: "PENDING",
        totalRows: sheet.rowCount,
        processedRows: 0,
        errorMessage: null,
      });
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "تعذر بدء الاستبدال.");
    } finally {
      setBusy(false);
    }
  }

  if (job) {
    const percent =
      job.status === "DONE"
        ? 100
        : Math.round((job.processedRows / Math.max(1, job.totalRows)) * 100);
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {job.status === "DONE" ? (
              <FileCheck2 className="size-6 text-primary" />
            ) : job.status === "FAILED" ? (
              <FileWarning className="size-6 text-destructive" />
            ) : (
              <LoaderCircle className="size-6 animate-spin" />
            )}
            {job.status === "DONE"
              ? "تم استبدال الملف بنجاح"
              : job.status === "FAILED"
                ? "فشل الاستبدال وبقي الملف القديم"
                : "جارٍ تجهيز الإصدار الجديد"}
          </CardTitle>
          <CardDescription>
            لا تُحذف البيانات القديمة إلا بعد اكتمال استيراد البيانات الجديدة.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={percent} />
          <p className="text-sm">
            {job.processedRows.toLocaleString("en-US")} من {job.totalRows.toLocaleString("en-US")}{" "}
            صف
          </p>
          {job.errorMessage ? (
            <p className="rounded-lg bg-destructive/10 p-3 text-destructive">{job.errorMessage}</p>
          ) : null}
          {job.status === "DONE" ? (
            <div className="flex gap-2">
              <Button asChild>
                <Link href={`/groups/${groupId}`}>عرض المجموعة</Link>
              </Button>
              {job.fileId ? (
                <Button asChild variant="outline">
                  <Link href={`/groups/${groupId}/files/${job.fileId}/quality`}>تقرير الجودة</Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>اختر المصنف الجديد</CardTitle>
          <CardDescription>سيُفحص صف العناوين أولًا قبل السماح بأي استبدال.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="file"
              accept=".xlsx,.xls"
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setInspection(null);
                applySheet(null);
              }}
            />
            <Button type="button" onClick={inspect} disabled={!file || busy}>
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <UploadCloud className="size-4" />
              )}
              فحص الملف
            </Button>
          </div>
          {inspection ? (
            <WorkbookSheetSelector
              key={inspection.token}
              inspection={inspection}
              sheet={sheet}
              onChange={applySheet}
              busy={busy}
              onBusyChange={setBusy}
            />
          ) : null}
        </CardContent>
      </Card>
      {sheet ? (
        <>
          <Card className={identical ? "border-primary/30" : "border-amber-500/40"}>
            <CardHeader>
              <CardTitle>{identical ? "البنية مطابقة" : "اكتُشف تغير في البنية"}</CardTitle>
              <CardDescription>
                {identical
                  ? "يمكن تحديث محتوى الملف مباشرة مع الاحتفاظ بهويته وربطه الحالي."
                  : "لا يسمح بالتحديث المباشر. سيُنشأ إصدار بديل بربط جديد، ثم يُحذف القديم بعد نجاحه."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {identical ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-muted p-4">
                    <p className="text-xs text-muted-foreground">الصفوف الحالية</p>
                    <p className="text-2xl font-black">{currentRows.toLocaleString("en-US")}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-4">
                    <p className="text-xs text-muted-foreground">الصفوف الجديدة</p>
                    <p className="text-2xl font-black">{sheet.rowCount.toLocaleString("en-US")}</p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <p className="mb-2 font-bold">أعمدة مضافة</p>
                    {diff.added.length ? (
                      diff.added.map((item) => (
                        <Badge key={item} className="mb-1 ms-1">
                          {item}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">لا يوجد</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-2 font-bold">أعمدة محذوفة</p>
                    {diff.removed.length ? (
                      diff.removed.map((item) => (
                        <Badge key={item} variant="destructive" className="mb-1 ms-1">
                          {item}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">لا يوجد</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-2 font-bold">أسماء متغيرة حسب الموضع</p>
                    {diff.renamed.length ? (
                      diff.renamed.map((item) => (
                        <p key={item} className="text-sm">
                          {item}
                        </p>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">لا يوجد</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          {!identical ? (
            <Card>
              <CardHeader>
                <CardTitle>ربط الإصدار البديل</CardTitle>
                <CardDescription>
                  تم نقل الربط القديم تلقائيًا للعناوين المتطابقة. راجع الحقول والفئات الجديدة.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {columns.map((column, index) => (
                  <div key={column.columnIndex} className="space-y-3 rounded-lg border p-3">
                    <div className="grid gap-3 md:grid-cols-[minmax(10rem,0.35fr)_1fr] md:items-center">
                      <p className="font-bold">{column.headerRaw}</p>
                      <FieldMappingSelect
                        ariaLabel={`حقل البحث للعمود ${column.headerRaw}`}
                        value={column.standardField ?? ""}
                        disabled={column.columnIndex === sheet.linkedSheets?.nationalIdColumnIndex}
                        onChange={(next) =>
                          updateColumn(index, {
                            standardField: (next || null) as StandardFieldKey | null,
                          })
                        }
                        options={[
                          { value: "", label: "غير مربوط" },
                          ...STANDARD_FIELD_KEYS.map((key) => ({
                            value: key,
                            label: STANDARD_FIELD_LABELS[key],
                            disabled: columns.some(
                              (item, itemIndex) =>
                                itemIndex !== index && item.standardField === key,
                            ),
                          })),
                        ]}
                      />
                    </div>
                    <CategorySelector
                      categories={categories}
                      value={column.categoryId}
                      onChange={(categoryId) => updateColumn(index, { categoryId })}
                      label={`فئة العمود ${column.headerRaw}`}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="lg" variant={identical ? "default" : "destructive"} className="w-full">
                <RefreshCw className="size-4" />
                {identical ? "استبدال جميع الصفوف" : "إنشاء الإصدار البديل"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {identical ? `استبدال بيانات «${fileName}»؟` : `استبدال بنية «${fileName}»؟`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {identical
                    ? `سيُحذف ${currentRows.toLocaleString("en-US")} صف حالي ويُستبدل بـ ${sheet.rowCount.toLocaleString("en-US")} صف جديد بعد نجاح الاستيراد. لا يُحتفظ بالبيانات السابقة.`
                    : `سيُستورد إصدار جديد من ${sheet.rowCount.toLocaleString("en-US")} صف. بعد نجاحه فقط، سيُحذف الملف القديم وترتفع قيمة الإصدار.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <Button
                  variant={identical ? "default" : "destructive"}
                  onClick={() => void start()}
                  disabled={busy}
                >
                  تأكيد وبدء الاستبدال
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </div>
  );
}
