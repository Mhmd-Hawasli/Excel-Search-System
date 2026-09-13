"use client";

import { useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { mergeService } from "@/services/misc.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MappingForm } from "@/features/merge/mapping-form";
import { ResultsView, type MergeClientResult } from "@/features/merge/results-view";
import { ChevronDown, ChevronUp, GripVertical, LoaderCircle, Play, RefreshCw, RotateCcw, Upload } from "lucide-react";
import {
  MERGE_RULE_KEYS,
  MERGE_RULES,
  ruleExecutionLabel,
  type MergeFieldKey,
  type MergeInspection,
  type MergeMapping,
  type MergeRuleKey,
} from "@/lib/merge/types";
import { suggestMergeMapping } from "@/lib/merge/suggest";

type TableState = {
  file: File | null;
  uploading: boolean;
  /** 0-100 while the bytes upload; stays 100 while the server inspects. */
  progress: number;
  inspection: MergeInspection | null;
  sheetName: string;
  headers: string[];
  preview: string[][];
  rowCount: number;
  mapping: MergeMapping;
  error: string | null;
};

function emptyTable(): TableState {
  return {
    file: null,
    uploading: false,
    progress: 0,
    inspection: null,
    sheetName: "",
    headers: [],
    preview: [],
    rowCount: 0,
    mapping: {},
    error: null,
  };
}

const steps = ["رفع الملفين وتحديد الأعمدة", "النتائج"];
function UploadPanel({
  title,
  state,
  setState,
  disabled,
}: {
  title: string;
  state: TableState;
  setState: (updater: (state: TableState) => TableState) => void;
  disabled: boolean;
}) {
  async function uploadFile(file: File) {
    if (disabled || state.uploading) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setState(() => ({ ...emptyTable(), file, error: "الصيغ المقبولة هي XLSX وXLS فقط." }));
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setState(() => ({ ...emptyTable(), file, error: "حجم الملف يتجاوز الحد المسموح وهو 50 ميغابايت." }));
      return;
    }
    setState(() => ({ ...emptyTable(), file, uploading: true }));
    try {
      const payload = await mergeService.inspect(file, (progress) =>
        setState((current) => ({ ...current, progress })),
      );
      setState((current) => ({
        ...current,
        file,
        uploading: false,
        progress: 0,
        inspection: payload,
        sheetName: payload.selected.sheetName,
        headers: payload.selected.headers,
        preview: payload.selected.preview,
        rowCount: payload.selected.rowCount,
        mapping: suggestMergeMapping(payload.selected.headers),
        error: null,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        file,
        uploading: false,
        error: error instanceof Error ? error.message : "تعذر فحص الملف.",
      }));
    }
  }

  async function selectSheet(sheetName: string) {
    if (disabled || state.uploading || !state.inspection) return;
    setState((current) => ({ ...current, uploading: true, error: null }));
    try {
      const selected = await mergeService.sheet(state.inspection.token, sheetName);
      setState((current) => ({
        ...current,
        uploading: false,
        sheetName: selected.sheetName,
        headers: selected.headers,
        preview: selected.preview,
        rowCount: selected.rowCount,
        mapping: suggestMergeMapping(selected.headers),
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        uploading: false,
        error: error instanceof Error ? error.message : "تعذر فحص الورقة.",
      }));
    }
  }

  return (
    <Card className="min-w-0">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold">{title}</h3>
          {state.inspection ? (
            <Badge variant="secondary">{state.rowCount.toLocaleString("en-US")} صف</Badge>
          ) : null}
        </div>
        <input
          type="file"
          accept=".xlsx,.xls"
          aria-label={`ملف Excel للـ${title}`}
          className="block w-full cursor-pointer text-sm text-muted-foreground file:me-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
          disabled={disabled || state.uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadFile(file);
          }}
        />
        {state.uploading ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <LoaderCircle className="size-4 animate-spin" />
                {state.progress < 100 ? "جارٍ رفع الملف…" : "جارٍ فحص الملف على الخادم…"}
              </span>
              <span className="font-bold text-foreground ltr-numbers">{state.progress}%</span>
            </div>
            <Progress value={state.progress} aria-label="نسبة رفع الملف" />
          </div>
        ) : null}
        {state.inspection && state.inspection.sheets.length > 1 ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">الورقة</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              disabled={disabled || state.uploading}
              value={state.sheetName}
              onChange={(event) => void selectSheet(event.target.value)}
            >
              {state.inspection.sheets.map((sheet) => (
                <option key={sheet.name} value={sheet.name}>
                  {sheet.name} — {sheet.rowCount.toLocaleString("en-US")} صف
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {state.headers.length ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[420px] text-xs">
              <thead className="bg-muted">
                <tr>
                  {state.headers.map((header, index) => (
                    <th key={index} className="whitespace-nowrap p-2 text-right">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.preview.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-t">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="max-w-36 truncate p-2">
                        {cell || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      </CardContent>
    </Card>
  );
}

function ruleHints(left: MergeMapping, right: MergeMapping) {
  const both = (field: MergeFieldKey) => left[field] !== undefined && right[field] !== undefined;
  const parts = (mapping: MergeMapping) =>
    mapping.firstName !== undefined ||
    mapping.fatherName !== undefined ||
    mapping.lastName !== undefined;
  const nameable = (mapping: MergeMapping) => mapping.fullName !== undefined || parts(mapping);
  const hints: Array<{ key: (typeof MERGE_RULES)[number]["key"]; ready: boolean }> = [
    { key: "full_name", ready: both("fullName") },
    { key: "composed_name", ready: nameable(left) && nameable(right) },
    { key: "national_id", ready: both("nationalId") },
    { key: "personal_no", ready: both("personalNo") },
    { key: "sham_cash", ready: both("shamCash") },
    { key: "phone", ready: both("phone") },
  ];
  return hints;
}

function SortableRuleItem({
  ruleKey,
  position,
  total,
  ready,
  disabled,
  onMove,
}: {
  ruleKey: MergeRuleKey;
  position: number;
  total: number;
  ready: boolean;
  disabled: boolean;
  onMove: (key: MergeRuleKey, direction: -1 | 1) => void;
}) {
  const rule = MERGE_RULES.find((item) => item.key === ruleKey);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ruleKey,
    disabled,
  });
  if (!rule) return null;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-start gap-2 rounded-lg border bg-background p-3 text-sm transition-shadow ${
        isDragging ? "border-primary shadow-lg" : ""
      } ${ready ? "" : "opacity-60"}`}
    >
      <span
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`اسحب لتغيير ترتيب ${ruleExecutionLabel(position, ruleKey)}`}
        title="اسحب لتغيير الترتيب"
        className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border text-muted-foreground ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-grab active:cursor-grabbing"
        }`}
      >
        <GripVertical className="size-4" />
      </span>
      <Badge variant={ready ? "default" : "outline"} className="mt-0.5 shrink-0 ltr-numbers">
        {position}
      </Badge>
      <span className="min-w-0 flex-1">
        <span className="font-semibold">
          {ruleExecutionLabel(position, ruleKey)} ({rule.method})
        </span>
        <span className="block text-xs text-muted-foreground">
          {ready ? "ستُطبق على الأسطر غير المربوطة" : "لن تُطبق — أعمدة القاعدة غير محددة في الجدولين"}
        </span>
      </span>
      <span className="flex shrink-0 flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7"
          disabled={disabled || position <= 1}
          onClick={() => onMove(ruleKey, -1)}
          aria-label={`نقل ${ruleExecutionLabel(position, ruleKey)} للأعلى`}
        >
          <ChevronUp className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7"
          disabled={disabled || position >= total}
          onClick={() => onMove(ruleKey, 1)}
          aria-label={`نقل ${ruleExecutionLabel(position, ruleKey)} للأسفل`}
        >
          <ChevronDown className="size-4" />
        </Button>
      </span>
    </li>
  );
}

export function MergeInterface() {
  const [left, setLeft] = useState<TableState>(emptyTable());
  const [right, setRight] = useState<TableState>(emptyTable());
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [runDetail, setRunDetail] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<MergeClientResult | null>(null);
  const [step, setStep] = useState(0);
  const [ignoreConfirmation, setIgnoreConfirmation] = useState(false);
  /** Manual execution order (first element runs first). Drag/drop + up/down reorder it. */
  const [ruleOrder, setRuleOrder] = useState<MergeRuleKey[]>([...MERGE_RULE_KEYS]);

  const ready = Boolean(
    left.inspection && right.inspection && !left.error && !right.error && !left.uploading && !right.uploading && !running,
  );
  const hints = ruleHints(left.mapping, right.mapping);
  const readinessByKey = new Map(hints.map((hint) => [hint.key, hint.ready]));
  const activeRules = hints.filter((hint) => hint.ready);
  const canRun = ready && activeRules.length > 0;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function moveRule(key: MergeRuleKey, direction: -1 | 1) {
    if (running) return;
    setRuleOrder((current) => {
      const index = current.indexOf(key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      return arrayMove(current, index, target);
    });
  }

  function handleRuleDragEnd(event: DragEndEvent) {
    if (running || !event.over || event.active.id === event.over.id) return;
    setRuleOrder((current) => {
      const oldIndex = current.indexOf(event.active.id as MergeRuleKey);
      const newIndex = current.indexOf(event.over?.id as MergeRuleKey);
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  }

  function resetRuleOrder() {
    if (running) return;
    setRuleOrder([...MERGE_RULE_KEYS]);
  }

  async function run() {
    if (!canRun || !left.inspection || !right.inspection) return;
    setRunning(true);
    setRunProgress(0);
    setRunDetail("بدء الدمج…");
    setRunError(null);
    try {
      const payload = await mergeService.run(
        {
          left: { token: left.inspection.token, sheetName: left.sheetName, mapping: left.mapping },
          right: {
            token: right.inspection.token,
            sheetName: right.sheetName,
            mapping: right.mapping,
          },
          ignoreConfirmation,
          ruleOrder,
        },
        (percent, detail) => {
          setRunProgress(percent);
          setRunDetail(detail);
        },
      );
      setResult(payload);
      setStep(1);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "تعذر تنفيذ الدمج.");
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setLeft(emptyTable());
    setRight(emptyTable());
    setResult(null);
    setRunError(null);
    setStep(0);
    setIgnoreConfirmation(false);
    setRuleOrder([...MERGE_RULE_KEYS]);
    setRunProgress(0);
    setRunDetail(null);
  }

  return (
    <div className="space-y-6">
      <nav aria-label="خطوات دمج الملفات" className="flex flex-wrap items-center gap-2 text-sm">
        {steps.map((label, index) => (
          <span key={label} className="flex items-center gap-2">
            {index ? <span className="text-muted-foreground">←</span> : null}
            <Badge variant={step === index ? "default" : "secondary"}>
              {index + 1} — {label}
            </Badge>
          </span>
        ))}
      </nav>

      {step === 0 ? (
        <div className="space-y-7">
          <div className="grid gap-5 lg:grid-cols-2">
            <UploadPanel title="الجدول الأول" state={left} setState={setLeft} disabled={running} />
            <UploadPanel
              title="الجدول الثاني"
              state={right}
              setState={setRight}
              disabled={running}
            />
          </div>

          <fieldset disabled={running || left.uploading || right.uploading} className="min-w-0 space-y-4" aria-label="تحديد أعمدة الربط">
            <h2 className="text-lg font-black">تحديد الأعمدة</h2>
            <p className="text-sm text-muted-foreground">
              تُقترح الأعمدة تلقائياً من عناوين Excel ويمكن تعديلها. حدد أي عمود يمثل كل حقل، وإذا
              لم يتوفر الحقل في الملف اتركه «غير مربوط» — وستُطبق القواعد المتاحة فقط. ابحث داخل
              قوائم الأعمدة بالكتابة، وألغِ أي ارتباط بزر ×، وأعد تطبيق الاقتراح الذكي أو استورد
              إعدادات الجدول الآخر بمطابقة أسماء الأعمدة. أدخل إما
              الاسم الثلاثي أو (الاسم واسم الأب والنسبة)، ولا يمكن الجمع بينهما. الربط مؤكد فقط: لا
              يُربط أي صف إلا بتطابق التأكد (الكلمة الأولى من اسم الأم لقاعدتي الاسم، والكلمة الأولى
              من الاسم الثلاثي — أو الاسم عند غيابه — لبقية القواعد)، والصفوف بلا تأكد تبقى بلا
              مفتاح وتظهر «غير مؤكد» في ملف الكل فقط.
            </p>
            <div className="grid gap-5 xl:grid-cols-2">
              <MappingForm
                title="الجدول الأول"
                headers={left.headers}
                mapping={left.mapping}
                rowCount={left.rowCount}
                onChange={(mapping) => setLeft((current) => ({ ...current, mapping }))}
                importSource={{ title: "الجدول الثاني", headers: right.headers, mapping: right.mapping }}
              />
              <MappingForm
                title="الجدول الثاني"
                headers={right.headers}
                mapping={right.mapping}
                rowCount={right.rowCount}
                onChange={(mapping) => setRight((current) => ({ ...current, mapping }))}
                importSource={{ title: "الجدول الأول", headers: left.headers, mapping: left.mapping }}
              />
            </div>
          </fieldset>

          <Card className="min-w-0">
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold">القواعد التي ستُطبق — رتّبها يدويًا حسب أولوية التنفيذ</h3>
                <span className="flex flex-wrap items-center gap-2">
                  {activeRules.length ? (
                    <Badge variant="secondary">{activeRules.length} قواعد جاهزة</Badge>
                  ) : (
                    <Badge variant="outline">لا توجد قواعد جاهزة بعد</Badge>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={resetRuleOrder}
                    disabled={running}
                    aria-label="إعادة ترتيب القواعد للوضع الافتراضي"
                  >
                    <RotateCcw className="size-4" />
                    الترتيب الافتراضي
                  </Button>
                </span>
              </div>
              <p className="text-xs leading-6 text-muted-foreground">
                اسحب أي قاعدة من المقبض أو استخدم زرّي الأعلى/الأسفل لتحديد من تُنفَّذ أولًا. تُطبَّق القواعد
                بالترتيب الظاهر هنا: الأولى تأخذ أولوية الربط، ثم تُطبَّق التالية على الأسطر غير المربوطة فقط.
              </p>
              <DndContext
                id="merge-rule-order"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleRuleDragEnd}
              >
                <SortableContext items={ruleOrder} strategy={verticalListSortingStrategy}>
                  <ul className="grid gap-2 text-sm md:grid-cols-2">
                    {ruleOrder.map((ruleKey, index) => (
                      <SortableRuleItem
                        key={ruleKey}
                        ruleKey={ruleKey}
                        position={index + 1}
                        total={ruleOrder.length}
                        ready={readinessByKey.get(ruleKey) ?? false}
                        disabled={running}
                        onMove={moveRule}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
              {runError ? <p className="text-sm text-destructive">{runError}</p> : null}
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition hover:border-primary/50">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-primary"
                  checked={ignoreConfirmation}
                  disabled={running}
                  onChange={(event) => setIgnoreConfirmation(event.target.checked)}
                  aria-label="ربط موسع بدون شرط التأكيد"
                />
                <span>
                  <span className="block text-sm font-bold">ربط موسع بدون شرط التأكيد</span>
                  <span className="mt-1 block text-xs leading-6 text-muted-foreground">
                    تُربط الصفوف بمجرد تطابق قيمة الربط (الاسم أو الرقم) دون اشتراط تطابق التأكد —
                    بشرط عدم تكرار القيمة داخل الملف وعدم تعدد المرشحين. الأزواج التي يطابق تأكدها
                    تظهر «مؤكد» والتي لا تطابق تظهر «غير مؤكد» في النتائج وملف الكل، بينما يحوي ملف
                    المؤكد المؤكدة فقط. راجع غير المؤكدة يدويًا قبل الاعتماد.
                  </span>
                </span>
              </label>
              {running ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span>{runDetail ?? "جارٍ تطبيق قواعد الربط…"}</span>
                    <span className="font-bold text-foreground ltr-numbers">{runProgress}%</span>
                  </div>
                  <Progress value={runProgress} aria-label="نسبة تطبيق قواعد الربط" />
                </div>
              ) : null}
              <Button size="lg" className="w-full" onClick={() => void run()} disabled={!canRun}>
                {running ? (
                  <LoaderCircle className="size-5 animate-spin" />
                ) : (
                  <Play className="size-5" />
                )}
                تشغيل قواعد الربط
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : result ? (
        <ResultsView result={result} onReset={reset} />
      ) : null}

      {step === 1 && runError ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/40 p-4">
          <p className="text-sm text-destructive">{runError}</p>
          <Button variant="outline" size="sm" onClick={() => setStep(0)}>
            <RefreshCw className="size-4" />
            العودة للإعدادات
          </Button>
        </div>
      ) : null}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Upload className="size-4" />
        قسم معزول: الملفات والنتائج مؤقتة داخل هذه الجلسة ولا تُحفظ في قاعدة بيانات الأرشيف.
      </p>
    </div>
  );
}

