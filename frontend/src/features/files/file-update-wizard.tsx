"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Eye, FileCheck2, FileWarning, LoaderCircle, RefreshCw, TriangleAlert, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import type { ReplacePreview, ReplacePreviewChange, SheetInspection, WorkbookInspection } from "@/types/model";
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
import { filesService } from "@/services/files.service";
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
  const [preview, setPreview] = useState<ReplacePreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [manualOnly, setManualOnly] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const autoPreviewKey = useRef<string | null>(null);
  // Per-cell choices: which changed cells keep their OLD value instead of the
  // new one. Default (absent from the map) is always the NEW value.
  const [overrides, setOverrides] = useState<Map<string, ReplacePreviewChange>>(new Map());

  function overrideKey(row: Pick<ReplacePreviewChange, "rowIndex" | "headerRaw">) {
    return JSON.stringify([row.rowIndex, row.headerRaw]);
  }
  function setCellChoice(row: ReplacePreviewChange, keepOld: boolean) {
    setOverrides((current) => {
      const next = new Map(current);
      if (keepOld) next.set(overrideKey(row), row);
      else next.delete(overrideKey(row));
      return next;
    });
  }
  function keepAllOld() {
    setOverrides(new Map((preview?.changes ?? []).map((row) => [overrideKey(row), row])));
  }
  function keepAllNew() {
    setOverrides(new Map());
  }
  function keepManualOld() {
    setOverrides(
      new Map(
        (preview?.changes ?? [])
          .filter((row) => row.wasManuallyEdited)
          .map((row) => [overrideKey(row), row]),
      ),
    );
  }
  const [job, setJob] = useUploadJobPolling({
    doneMessage: "تم إنشاء الإصدار الجديد بنجاح. سجل تعديلات الإصدار السابق محفوظ في سجل التعديلات.",
    failedFallbackMessage: "فشل تحديث الملف وبقيت البيانات السابقة محفوظة.",
  });

  function applySheet(next: SheetInspection | null) {
    setSheet(next);
    setPreview(null);
    setManualOnly(false);
    setFilterText("");
    setPage(1);
    setOverrides(new Map());
    autoPreviewKey.current = null;
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
  const identical = useMemo(() => {
    if (!sheet) return false;
    const newSet = new Set(sheet.columns.map((column) => column.headerNormalized));
    // Smart name-based check (not positional): direct update is allowed as long
    // as no column was REMOVED. Added/reordered columns are matched by name
    // and reported separately in the preview.
    return existingColumns.every((column) => newSet.has(column.headerNormalized));
  }, [sheet, existingColumns]);
  const diff = useMemo(() => {
    if (!sheet) return { added: [] as string[], removed: [] as string[], reordered: false };
    const oldSet = new Set(existingColumns.map((column) => column.headerNormalized));
    const newSet = new Set(sheet.columns.map((column) => column.headerNormalized));
    const added = sheet.columns
      .filter((column) => !oldSet.has(column.headerNormalized))
      .map((column) => column.headerRaw);
    const removed = existingColumns
      .filter((column) => !newSet.has(column.headerNormalized))
      .map((column) => column.headerRaw);
    const sameOrder =
      existingColumns.length === sheet.columns.length &&
      existingColumns.every(
        (column, index) => column.headerNormalized === sheet.columns[index]?.headerNormalized,
      );
    return {
      added,
      removed,
      reordered: added.length === 0 && removed.length === 0 && !sameOrder,
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
  function buildReplaceBody() {
    if (!inspection || !sheet) return null;
    const mode = identical ? "same" : "different";
    return {
      mode,
      token: inspection.token,
      originalFilename: inspection.originalFilename,
      sheetName: sheet.sheetName,
      sheetIndex: sheet.sheetIndex,
      totalRows: sheet.rowCount,
      linkedSheets: sheet.linkedSheets ?? undefined,
      // Per-cell keep-old is only meaningful for the direct update path.
      // The alternate-version path (different) replaces the whole structure,
      // so the preview there is read-only and no keep-old choices are sent.
      keepOldCells:
        mode === "same" && overrides.size > 0
          ? [...overrides.values()].map((row) => ({
              rowIndex: row.rowIndex,
              headerRaw: row.headerRaw,
              matchKey: row.matchKey,
            }))
          : undefined,
      columns: columns.map(
        ({ headerRaw, headerNormalized, columnIndex, standardField, categoryId }) => ({
          headerRaw,
          headerNormalized,
          columnIndex,
          standardField,
          categoryId,
        }),
      ),
    } satisfies Record<string, unknown>;
  }

  const filteredChanges = useMemo(() => {
    const rows = preview?.changes ?? [];
    const needle = filterText.trim();
    const filtered = rows.filter((row) => {
      if (manualOnly && !row.wasManuallyEdited) return false;
      if (!needle) return true;
      return (
        row.headerRaw.includes(needle) ||
        row.currentValue.includes(needle) ||
        row.newValue.includes(needle) ||
        String(row.rowIndex).includes(needle)
      );
    });
    // المعدلة يدويًا أولًا دائمًا، ثم حسب الصف والعمود — حتى مع الفلاتر.
    return [...filtered].sort((a, b) => {
      const m = Number(b.wasManuallyEdited) - Number(a.wasManuallyEdited);
      if (m !== 0) return m;
      if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex;
      return a.columnIndex - b.columnIndex;
    });
  }, [preview, manualOnly, filterText]);

  const pageCount = Math.max(1, Math.ceil(filteredChanges.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filteredChanges.slice((safePage - 1) * pageSize, safePage * pageSize);

  async function runPreview() {
    const body = buildReplaceBody();
    if (!body) return;
    setPreviewBusy(true);
    try {
      const result = await filesService.previewReplace(fileId, body);
      setPreview(result);
      setPage(1);
      setOverrides(new Map());
      if ((result.summary?.changedCells ?? 0) === 0) {
        const shaping = result.summary?.formattingOnlyCells ?? 0;
        toast.success(
          shaping > 0
            ? `لا توجد تغييرات حقيقية — ${shaping.toLocaleString("en-US")} خلية شكلية فقط (نفس القيمة بتنسيق مختلف).`
            : "البيانات متطابقة تمامًا — لا توجد خلايا متغيرة.",
        );
      }
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "تعذر معاينة الفروقات.");
    } finally {
      setPreviewBusy(false);
    }
  }

  // مقارنة تلقائية خلية بخلية فور اختيار الورقة — للمسارين معًا:
  // التحديث المباشر والإصدار البديل يعرضان القيم القديمة مقابل الجديدة.
  // لا حاجة لضغط أي زر: كل خلية مشتركة بالاسم تُقارن مع قيمتها الحالية.
  useEffect(() => {
    if (!sheet || !inspection || preview || previewBusy || busy || job) return;
    const key = `${inspection.token}:${sheet.sheetName}:${sheet.sheetIndex}`;
    if (autoPreviewKey.current === key) return;
    autoPreviewKey.current = key;
    void runPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, inspection, preview, previewBusy, busy, job]);

  async function start() {
    const body = buildReplaceBody();
    if (!body || !sheet) return;
    setBusy(true);
    try {
      const { jobId } = await uploadService.replace(fileId, body);
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
              ? "تم إنشاء الإصدار الجديد بنجاح"
              : job.status === "FAILED"
                ? "فشل الاستبدال وبقي الملف القديم"
                : "جارٍ تجهيز الإصدار الجديد"}
          </CardTitle>
          <CardDescription>
            {job.status === "DONE"
              ? "سجل تعديلات الإصدار السابق محفوظ ومؤرشف في سجل التعديلات، وصفحة البيانات تعرض تعديلات الإصدار الحالي فقط."
              : "لا تُحذف البيانات القديمة إلا بعد اكتمال استيراد البيانات الجديدة."}
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
                <>
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
                  {diff.added.length ? (
                    <div className="mt-3">
                      <p className="mb-2 font-bold">أعمدة جديدة ستُضاف (تُطابق بقية الأعمدة بالاسم)</p>
                      {diff.added.map((item) => (
                        <Badge key={item} className="mb-1 ms-1 bg-primary/15 text-primary">
                          + {item}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {diff.reordered ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      نفس الأعمدة بترتيب مختلف — ستُطابق القيم حسب اسم العمود وليس موضعه.
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
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
          {
            <Card className={identical ? "border-primary/30" : "border-amber-500/40"}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="size-5 text-primary" />
                  {identical
                    ? "معاينة الفروقات خلية بخلية"
                    : "معاينة فروقات الإصدار البديل — القديم مقابل الجديد"}
                </CardTitle>
                <CardDescription>
                  {identical
                    ? "يقارن كل خلية بين القيمة الحالية في النظام والقيمة في الملف الجديد، ويميز القيم التي تم تعديلها داخليًا وستُستبدل."
                    : "يقارن الأعمدة المشتركة بالاسم بين القيمة الحالية في النظام والقيمة في الملف الجديد (قديم مقابل جديد)، مع توضيح الأعمدة التي ستُفقد والصفوف التي ستتغير قبل إنشاء الإصدار البديل."}
                  {preview?.matchMode === "nationalId" || preview?.summary?.matchMode === "nationalId"
                    ? " المطابقة تمت عبر الرقم الوطني."
                    : " المطابقة تمت حسب ترتيب الصفوف."}
                  {!identical
                    ? " المعاينة هنا للمراجعة فقط — الإصدار البديل يستبدل البنية كاملة ولا يدعم الاحتفاظ بقيم قديمة خلية بخلية."
                    : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void runPreview()}
                    disabled={previewBusy || busy}
                  >
                    {previewBusy ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                    {preview ? "إعادة معاينة الفروقات" : "معاينة الفروقات قبل التحديث"}
                  </Button>
                  {preview?.summary ? (
                    <p className="text-xs text-muted-foreground">
                      {preview.summary.totalCellsCompared.toLocaleString("en-US")} خلية تمت مقارنتها
                      خلال ثوانٍ — التقرير يعرض{" "}
                      {(preview.changes?.length ?? 0).toLocaleString("en-US")} من{" "}
                      {preview.summary.changedCells.toLocaleString("en-US")} خلية متغيرة حقيقيًا
                      {preview.truncated ? " (مقتطع للحد الأقصى)" : " كاملة"}، مرتبةً بحيث تظهر
                      القيم المعدلة يدويًا أولًا، مع ترقيم صفحات.
                      {(preview.summary.formattingOnlyCells ?? 0) > 0 ? (
                        <> القيم الشكلية فقط ({(preview.summary.formattingOnlyCells ?? 0).toLocaleString("en-US")}) مستثناة — نفس القيمة بتنسيق مختلف.</>
                      ) : null}
                    </p>
                  ) : previewBusy ? (
                    <p className="flex items-center gap-2 text-xs font-bold text-primary">
                      <LoaderCircle className="size-4 animate-spin" />
                      جارٍ مقارنة كل خلية مع القيمة الحالية في النظام…
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      ستُقارن كل خلية تلقائيًا مع القيمة الحالية فور اختيار الورقة، ويمكنك إعادة
                      التشغيل يدويًا من هنا.
                    </p>
                  )}
                </div>

                {preview?.summary ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                      <div className="rounded-lg bg-muted p-3">
                        <p className="text-xs text-muted-foreground">خلايا متغيرة حقيقيًا</p>
                        <p className="mt-1 text-xl font-black">{preview.summary.changedCells.toLocaleString("en-US")}</p>
                      </div>
                      <div className="rounded-lg bg-sky-500/10 p-3" title="نفس القيمة منطقيًا بتنسيق مختلف: أصفار بادئة، ترتيب التاريخ، مسافات زائدة — لا تُحتسب تغييرًا ولا تُسجل في سجل التعديلات">
                        <p className="text-xs text-muted-foreground">تغييرات شكلية فقط</p>
                        <p className="mt-1 text-xl font-black text-sky-700 dark:text-sky-300">
                          {(preview.summary.formattingOnlyCells ?? 0).toLocaleString("en-US")}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted p-3">
                        <p className="text-xs text-muted-foreground">صفوف متغيرة</p>
                        <p className="mt-1 text-xl font-black">{preview.summary.changedRows.toLocaleString("en-US")}</p>
                      </div>
                      <div className="rounded-lg bg-amber-500/10 p-3">
                        <p className="text-xs text-muted-foreground">قيم يدوية ستُستبدل</p>
                        <p className="mt-1 text-xl font-black text-amber-700 dark:text-amber-300">
                          {preview.summary.manualOverwriteCount.toLocaleString("en-US")}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted p-3">
                        <p className="text-xs text-muted-foreground">صفوف مضافة</p>
                        <p className="mt-1 text-xl font-black">{preview.summary.addedRows.toLocaleString("en-US")}</p>
                      </div>
                      <div className="rounded-lg bg-muted p-3">
                        <p className="text-xs text-muted-foreground">صفوف محذوفة</p>
                        <p className="mt-1 text-xl font-black">{preview.summary.removedRows.toLocaleString("en-US")}</p>
                      </div>
                      <div className="rounded-lg bg-muted p-3">
                        <p className="text-xs text-muted-foreground">صفوف بلا تغيير</p>
                        <p className="mt-1 text-xl font-black">{preview.summary.unchangedRows.toLocaleString("en-US")}</p>
                      </div>
                    </div>

                    {preview.summary.manualOverwriteCount > 0 ? (
                      <div className="flex gap-2 rounded-xl border border-amber-400/60 bg-amber-50 p-3 text-sm dark:bg-amber-950/20">
                        <TriangleAlert className="size-5 shrink-0 text-amber-600" />
                        <p>
                          <span className="font-bold">
                            {preview.summary.manualOverwriteCount.toLocaleString("en-US")} قيمة معدلة يدويًا
                          </span>{" "}
                          ستُستبدل بقيم الملف الجديد. هذه الصفوف مميزة باللون الكهرماني في الجدول أدناه.
                          التعديلات القديمة تبقى مؤرشفة في سجل التعديلات.
                        </p>
                      </div>
                    ) : null}

                    {(preview.summary.formattingOnlyCells ?? 0) > 0 ? (
                      <div className="flex gap-2 rounded-xl border border-sky-400/50 bg-sky-50 p-3 text-sm dark:bg-sky-950/20">
                        <Eye className="size-5 shrink-0 text-sky-600" />
                        <p>
                          <span className="font-bold">
                            {(preview.summary.formattingOnlyCells ?? 0).toLocaleString("en-US")} خلية تحمل نفس القيمة منطقيًا بتنسيق مختلف
                          </span>{" "}
                          (صفر بادئ ضائع مثل 0417 مقابل 417، ترتيب تاريخ مختلف مثل 13/08/2024 مقابل 8/13/2024، مسافات زائدة، محارف غير مرئية كعلامات اتجاه النص في الإيميل).
                          هذه الخلايا <span className="font-bold">ليست تغييرًا حقيقيًا</span> — لن تُحتسب في العدّادات أعلاه ولن تُسجل في سجل التعديلات،
                          وستُكتب بتنسيق الملف الجديد فقط.
                        </p>
                      </div>
                    ) : null}

                    {!identical && preview.removedColumns && preview.removedColumns.length ? (
                      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
                        <p className="font-bold text-destructive">
                          أعمدة ستُفقد نهائيًا مع كل قيمها ({preview.removedColumns.length.toLocaleString("en-US")}):
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {preview.removedColumns.map((item) => (
                            <Badge key={item} variant="destructive">
                              − {item}
                            </Badge>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          كل قيمة مخزنة تحت هذه الأعمدة ({currentRows.toLocaleString("en-US")} صف × {preview.removedColumns.length.toLocaleString("en-US")} عمود) ستُحذف عند إنشاء الإصدار البديل. الجدول أدناه يقارن فقط الأعمدة المشتركة المتبقية (قديم مقابل جديد).
                        </p>
                      </div>
                    ) : null}

                    {preview.newColumns && preview.newColumns.length ? (
                      <div className="overflow-x-auto rounded-lg border border-primary/30">
                        <table className="w-full text-sm">
                          <thead className="bg-primary/5">
                            <tr>
                              <th className="p-2 text-right">عمود جديد سيُضاف</th>
                              <th className="p-2 text-right">قيم معبأة في الملف الجديد</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.newColumns.map((c) => (
                              <tr key={c.headerRaw} className="border-t">
                                <td className="p-2 font-bold">+ {c.headerRaw}</td>
                                <td className="p-2">{c.filledValues.toLocaleString("en-US")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    {preview.columnStats && preview.columnStats.length === 0 ? (
                      <p className="rounded-lg bg-destructive/5 p-3 text-sm font-bold text-destructive">
                        لا توجد أعمدة مشتركة بالاسم بين الملف الحالي والملف الجديد — كل البيانات الحالية ستُستبدل بالكامل، ولا توجد قيم قديمة قابلة للمقارنة خلية بخلية. راجع أعداد الصفوف أعلاه وقائمة الأعمدة المفقودة/المضافة قبل التأكيد.
                      </p>
                    ) : null}

                    {preview.summary.changedCells === 0 ? (
                      <p className="rounded-lg bg-primary/5 p-3 text-sm font-bold text-primary">
                        {preview.columnStats && preview.columnStats.length === 0
                          ? "لا توجد أعمدة مشتركة للمقارنة — التغيير هنا هو استبدال كامل للبنية والصفوف."
                          : preview.newColumns && preview.newColumns.length
                            ? "القيم في الأعمدة المشتركة متطابقة تمامًا — التحديث سيضيف الأعمدة الجديدة أعلاه فقط."
                            : identical
                              ? "البيانات متطابقة تمامًا — لا يوجد أي اختلاف بين النظام والملف الجديد."
                              : "القيم في الأعمدة المشتركة متطابقة تمامًا — التغيير في الإصدار البديل هو فقدان الأعمدة المحذوفة وإضافة الجديدة أعلاه مع تغير أعداد الصفوف."}
                      </p>
                    ) : (
                      <>
                        {preview.columnStats && preview.columnStats.some((c) => c.changedCells > 0 || (c.formattingOnlyCells ?? 0) > 0) ? (
                          <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                              <thead className="bg-muted">
                                <tr>
                                  <th className="p-2 text-right">العمود</th>
                                  <th className="p-2 text-right">خلايا متغيرة حقيقيًا</th>
                                  <th className="p-2 text-right">منها يدوية</th>
                                  <th className="p-2 text-right">شكلية فقط</th>
                                </tr>
                              </thead>
                              <tbody>
                                {preview.columnStats
                                  .filter((c) => c.changedCells > 0 || (c.formattingOnlyCells ?? 0) > 0)
                                  .sort((a, b) => b.changedCells - a.changedCells)
                                  .slice(0, 20)
                                  .map((c) => (
                                    <tr key={c.headerRaw} className="border-t">
                                      <td className="p-2 font-bold">{c.headerRaw}</td>
                                      <td className="p-2">{c.changedCells.toLocaleString("en-US")}</td>
                                      <td className="p-2">
                                        {c.manualOverwriteCells > 0 ? (
                                          <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-200">
                                            {c.manualOverwriteCells.toLocaleString("en-US")} يدوية
                                          </Badge>
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                      <td className="p-2">
                                        {(c.formattingOnlyCells ?? 0) > 0 ? (
                                          <span className="text-sky-700 dark:text-sky-300">
                                            {(c.formattingOnlyCells ?? 0).toLocaleString("en-US")} شكلية
                                          </span>
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Input
                            placeholder="بحث بعمود أو قيمة أو رقم صف…"
                            value={filterText}
                            onChange={(e) => {
                              setFilterText(e.target.value);
                              setPage(1);
                            }}
                            className="sm:max-w-xs"
                          />
                          <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium">
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={manualOnly}
                              onChange={(e) => {
                                setManualOnly(e.target.checked);
                                setPage(1);
                              }}
                            />
                            إظهار القيم المعدلة يدويًا فقط
                          </label>
                          <p className="text-xs text-muted-foreground sm:ms-auto">
                            {filteredChanges.length.toLocaleString("en-US")} من{" "}
                            {preview.summary.changedCells.toLocaleString("en-US")} خلية متغيرة
                            {preview.truncated
                              ? ` (يُعرض ${(preview.changes?.length ?? 0).toLocaleString("en-US")} — مقتطع)`
                              : " (العرض الكامل)"}
                            {" — "}
                            {!identical ? (
                              <span>عرض للمراجعة فقط — الإصدار البديل يعتمد القيم الجديدة دائمًا</span>
                            ) : overrides.size > 0 ? (
                              <span className="font-bold text-amber-700 dark:text-amber-300">
                                {overrides.size.toLocaleString("en-US")} خلية ستبقى بقيمتها القديمة
                              </span>
                            ) : (
                              <span>الكل يعتمد القيمة الجديدة (افتراضي)</span>
                            )}
                          </p>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            حجم الصفحة
                            <select
                              aria-label="حجم الصفحة"
                              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                              value={pageSize}
                              onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setPage(1);
                              }}
                            >
                              {[50, 100, 200, 500].map((size) => (
                                <option key={size} value={size}>
                                  {size}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        {identical ? (
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-bold">اعتماد جماعي:</span>
                            <Button type="button" size="sm" variant="outline" onClick={keepAllNew}>
                              الكل: الجديدة
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={keepAllOld}>
                              الكل: القديمة ({(preview.changes?.length ?? 0).toLocaleString("en-US")})
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={keepManualOld}>
                              المعدلة يدويًا فقط: القديمة (
                              {(preview.changes ?? []).filter((r) => r.wasManuallyEdited).length.toLocaleString("en-US")})
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              الاختيار الجماعي يشمل كل القيم المعروضة أعلاه (المعدلة يدويًا تظهر أولًا)،
                              وسيُحفظ الاستبدال كاملًا في سجل التعديلات تحت الإصدار {preview.nextVersion || preview.currentVersion + 1}.
                              {(preview.pendingEditCount ?? 0) > 0 ? (
                                <> تنبيه: لديك {preview.pendingEditCount} تعديل يدوي على الإصدار الحالي — ستُحفظ في إصدار منفصل ({preview.currentVersion + 1}) ويصبح هذا التحديث الإصدار {preview.nextVersion || preview.currentVersion + 2}.</>
                              ) : null}
                            </span>
                          </div>
                        ) : (
                          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                            المعاينة أعلاه للمراجعة فقط: الإصدار البديل يعتمد القيم الجديدة في الأعمدة المشتركة،
                            ويفقد الأعمدة المحذوفة نهائيًا. سيُحفظ ما تغير في سجل التعديلات تحت الإصدار {preview.nextVersion || preview.currentVersion + 1}.
                            {(preview.pendingEditCount ?? 0) > 0 ? (
                              <> تنبيه: لديك {preview.pendingEditCount} تعديل يدوي على الإصدار الحالي — ستُحفظ في إصدار منفصل ({preview.currentVersion + 1}).</>
                            ) : null}
                          </p>
                        )}

                        {pageRows.length ? (
                          <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                              <thead className="bg-muted">
                                <tr>
                                  <th className="p-2 text-right">صف</th>
                                  <th className="p-2 text-right">العمود</th>
                                  <th className="p-2 text-right">القيمة الحالية (القديمة)</th>
                                  <th className="p-2 text-right">القيمة الجديدة</th>
                                  <th className="p-2 text-right">الحالة</th>
                                  {identical ? <th className="p-2 text-right">الاعتماد</th> : null}
                                </tr>
                              </thead>
                              <tbody>
                                {pageRows.map((row, i) => {
                                  const keepOld = identical && overrides.has(overrideKey(row));
                                  return (
                                  <tr
                                    key={`${row.rowIndex}-${row.headerRaw}-${i}`}
                                    className={
                                      row.wasManuallyEdited
                                        ? "border-t bg-amber-500/10"
                                        : "border-t"
                                    }
                                  >
                                    <td className="p-2">{row.rowIndex.toLocaleString("en-US")}</td>
                                    <td className="p-2 font-bold">{row.headerRaw}</td>
                                    <td
                                      className={
                                        keepOld
                                          ? "max-w-45 p-2 break-words font-bold text-foreground"
                                          : "max-w-45 p-2 break-words text-muted-foreground"
                                      }
                                    >
                                      {row.currentValue === "" ? "—" : row.currentValue}
                                    </td>
                                    <td
                                      className={
                                        keepOld
                                          ? "max-w-45 p-2 break-words text-muted-foreground"
                                          : "max-w-45 p-2 break-words font-bold text-primary"
                                      }
                                    >
                                      {row.newValue === "" ? "—" : row.newValue}
                                    </td>
                                    <td className="p-2">
                                      {row.wasManuallyEdited ? (
                                        <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-200">
                                          معدلة يدويًا{row.editedBy ? ` — ${row.editedBy}` : ""}
                                        </Badge>
                                      ) : (
                                        <span className="text-muted-foreground">عادية</span>
                                      )}
                                    </td>
                                    {identical ? (
                                      <td className="p-2">
                                        <div
                                          role="group"
                                          aria-label={`اعتماد القيمة للصف ${row.rowIndex} عمود ${row.headerRaw}`}
                                          className="flex w-fit overflow-hidden rounded-md border text-xs font-bold"
                                        >
                                          <button
                                            type="button"
                                            onClick={() => setCellChoice(row, false)}
                                            aria-pressed={!keepOld}
                                            className={
                                              !keepOld
                                                ? "bg-primary px-2.5 py-1.5 text-primary-foreground"
                                                : "px-2.5 py-1.5 text-muted-foreground hover:bg-muted"
                                            }
                                          >
                                            الجديدة
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setCellChoice(row, true)}
                                            aria-pressed={keepOld}
                                            className={
                                              keepOld
                                                ? "bg-amber-500 px-2.5 py-1.5 text-white"
                                                : "px-2.5 py-1.5 text-muted-foreground hover:bg-muted"
                                            }
                                          >
                                            القديمة
                                          </button>
                                        </div>
                                      </td>
                                    ) : null}
                                  </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">لا توجد نتائج مطابقة للفلتر الحالي.</p>
                        )}

                        {pageCount > 1 ? (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={safePage <= 1}
                                onClick={() => setPage(1)}
                              >
                                الأولى
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={safePage <= 1}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                              >
                                السابق
                              </Button>
                            </div>
                            <p className="text-muted-foreground">
                              صفحة {safePage.toLocaleString("en-US")} من {pageCount.toLocaleString("en-US")}
                              {" — "}
                              {filteredChanges.length.toLocaleString("en-US")} خلية ({pageSize} / صفحة)
                            </p>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={safePage >= pageCount}
                                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                              >
                                التالي
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={safePage >= pageCount}
                                onClick={() => setPage(pageCount)}
                              >
                                الأخيرة
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}
                  </>
                ) : null}
              </CardContent>
            </Card>
          }
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
                    ? `سيُحذف ${currentRows.toLocaleString("en-US")} صف حالي ويُستبدل بـ ${sheet.rowCount.toLocaleString("en-US")} صف جديد بعد نجاح الاستيراد، ويصبح الملف الإصدار ${preview ? preview.nextVersion || preview.currentVersion + 1 : "الجديد"}. كل الخلايا المتغيرة (${preview?.summary?.changedCells.toLocaleString("en-US") ?? "—"}) ستُحفظ في سجل التعديلات تحت هذا الإصدار الجديد، وتعديلاتك اليدوية السابقة تُحفظ مؤرشفة ولا تُمسح.${(preview && (preview.pendingEditCount ?? 0) > 0) ? ` تنبيه: تعديلاتك اليدوية (${preview.pendingEditCount}) ستُحفظ في إصدار منفصل (${preview.currentVersion + 1}).` : ""}${
                        overrides.size > 0
                          ? ` وسيُحتفظ بـ ${overrides.size.toLocaleString("en-US")} خلية بقيمها القديمة حسب اختيارك أعلاه.`
                          : ""
                      }`
                    : `سيُستورد إصدار بديل من ${sheet.rowCount.toLocaleString("en-US")} صف بدل ${currentRows.toLocaleString("en-US")} صف حالي. بعد نجاحه فقط، سيُحذف الملف القديم ويصبح الإصدار ${preview ? preview.nextVersion || preview.currentVersion + 1 : "الجديد"}.${preview?.summary ? ` الأعمدة المشتركة: ${preview.summary.changedCells.toLocaleString("en-US")} خلية متغيرة في ${preview.summary.changedRows.toLocaleString("en-US")} صف (قديم مقابل جديد كما في المعاينة أعلاه)، و${preview.summary.addedRows.toLocaleString("en-US")} صف مضاف و${preview.summary.removedRows.toLocaleString("en-US")} صف محذوف.` : ""}${preview?.removedColumns?.length ? ` الأعمدة المفقودة نهائيًا (${preview.removedColumns.length}): ${preview.removedColumns.join("، ")}.` : ""}${preview?.addedColumns?.length ? ` الأعمدة الجديدة: ${preview.addedColumns.join("، ")}.` : ""} تعديلاتك اليدوية السابقة تُحفظ مؤرشفة في سجل التعديلات ولا تُمسح.`}
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
