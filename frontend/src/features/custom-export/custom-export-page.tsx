"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileUp,
  GripVertical,
  LoaderCircle,
  PencilLine,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { ExportButton } from "@/components/export-button";
import { EmptyState } from "@/components/empty-state";
import { FilePicker } from "@/components/file-picker";
import { LoadingScreen } from "@/components/loading-screen";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { hasPermission } from "@/lib/permissions";
import { suggestSource } from "@/lib/custom-export/suggest-source";
import { computeHighlightRanges } from "@/lib/highlight";
import { matchesNormalizedText, normalizeQuery, normalizeStored } from "@/lib/normalization";
import { useExportLock } from "@/lib/export-lock";
import { authService } from "@/services/auth.service";
import {
  customExportService,
  type ExportSourceFile,
  type ExportTemplate,
  type ExportTemplateColumn,
  type ImportSheetHeaders,
} from "@/services/custom-export.service";
import { cn } from "@/lib/cn";

type EditorRow = {
  /** مفتاح فريد للسحب والإفلات: المصدر للأعمدة الأصلية، ومعرف مؤقت للمضافة. */
  id: string;
  /** اسم العمود في التصدير — هو مرجع الصف (افتراضيًا مطابق للأصلي). */
  exportName: string;
  /** العمود الأصلي المغذي له (null = عمود فارغ بلا مصدر). */
  source: string | null;
  selected: boolean;
  replacements: Array<{ from: string; to: string }>;
};

function downloadBlob(blob: Blob, filename: string | null, fallback: string) {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename ?? fallback;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/**
 * محرر استبدالات قيم عمود واحد: أزواج (من → إلى) تُطبق عند التصدير
 * عندما تطابق القيمة الكاملة للخلية.
 */
function ReplacementEditor({
  row,
  index,
  onChange,
}: {
  row: EditorRow;
  index: number;
  onChange: (index: number, replacements: Array<{ from: string; to: string }>) => void;
}) {
  const reps = row.replacements;
  function patch(i: number, key: "from" | "to", value: string) {
    onChange(
      index,
      reps.map((r, j) => (j === i ? { ...r, [key]: value } : r)),
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        ربط يدوي لقيم العمود «{row.exportName || row.source}»: كل خلية تطابق القيمة الأصلية كاملةً تُصدَّر بالقيمة البديلة.
        مثال: من «فئة الأولى» إلى «الفئة الأولى».
      </p>
      {reps.length === 0 ? (
        <p className="text-xs text-muted-foreground">لا توجد استبدالات بعد — أضف أول زوج بالزر أدناه.</p>
      ) : (
        <div className="grid gap-2">
          {reps.map((rep, i) => (
            <div key={i} className="flex flex-col gap-2 md:flex-row md:items-center">
              <Input
                value={rep.from}
                onChange={(e) => patch(i, "from", e.target.value)}
                placeholder="القيمة الأصلية في الملف…"
                aria-label={`القيمة الأصلية ${i + 1} للعمود ${row.exportName || row.source}`}
                maxLength={500}
              />
              <ArrowLeftRight className="size-4 shrink-0 self-center text-muted-foreground" />
              <Input
                value={rep.to}
                onChange={(e) => patch(i, "to", e.target.value)}
                placeholder="القيمة البديلة في التصدير…"
                aria-label={`القيمة البديلة ${i + 1} للعمود ${row.exportName || row.source}`}
                maxLength={500}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => onChange(index, reps.filter((_, j) => j !== i))}
                aria-label={`حذف الاستبدال ${i + 1}`}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={reps.length >= 100}
        onClick={() => onChange(index, [...reps, { from: "", to: "" }])}
      >
        <Plus className="size-4" />
        إضافة استبدال
      </Button>
    </div>
  );
}

/**
 * اختيار العمود الأصلي المغذي لعمود التصدير: قائمة منسدلة مع بحث
 * (تطبيع عربي)، والمصادر المستخدمة في صفوف أخرى تظهر معطلة.
 */
function ColumnSourcePicker({
  sources,
  value,
  usedSources,
  onChange,
  ariaLabel,
}: {
  sources: string[];
  value: string | null;
  usedSources: Map<string, number>;
  onChange: (source: string | null) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // التمرير التلقائي للخيار النشط مخصص للتنقل بالكيبورد فقط —
  // الـ hover بالماوس يجب ألا يحرّك أي تمرير إطلاقًا.
  const keyboardNavRef = useRef(false);

  function close() {
    setOpen(false);
    setPos(null);
  }

  function toggle() {
    if (open) {
      close();
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    // اللوحة تُرسم في portal ثابت فوق كل الطبقات: تُفتح أسفل الزر دائمًا
    // مع ارتفاع متكيف مع المساحة المتاحة، ولا تُقلب للأعلى إلا عند ضيق
    // المساحة أسفلها فعليًا مع توفر مساحة أكبر أعلاها.
    const reserve = 76; // صندوق البحث والحواف
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    let up = false;
    let maxH = 240;
    if (spaceBelow < reserve + 140 && spaceAbove > spaceBelow) {
      up = true;
      maxH = Math.max(120, Math.min(240, spaceAbove - reserve));
    } else {
      maxH = Math.max(120, Math.min(240, spaceBelow - reserve));
    }
    setPos({
      top: up ? Math.max(8, rect.top - 4 - maxH - reserve) : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: rect.width,
      maxH,
    });
    setQ("");
    setActiveIdx(0);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        btnRef.current && !btnRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    function onScroll() { close(); }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open ]);

  const filtered = useMemo(() => {
    const needle = normalizeStored(q.trim());
    if (!needle) return sources;
    return sources.filter((s) => normalizeStored(s).includes(needle));
  }, [sources, q ]);

  function pick(next: string | null) {
    onChange(next);
    setOpen(false);
    setQ("");
    setActiveIdx(0);
  }

  // تنقل الكيبورد: الخيار 0 هو «بدون مصدر»، ثم الأعمدة المصفاة.
  const navItems = useMemo<Array<string | null>>(
    () => [null, ...filtered],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered.join("\u001f")],
  );

  useEffect(() => {
    setActiveIdx((current) => Math.min(current, Math.max(0, navItems.length - 1)));
  }, [navItems.length]);

  useEffect(() => {
    if (!open || !keyboardNavRef.current) return;
    keyboardNavRef.current = false;
    const panel = panelRef.current;
    const el = panel?.querySelector('[data-nav-active="true"]') as HTMLElement | null;
    const list = el?.closest("[data-scroll-list]") as HTMLElement | null;
    if (!list || !el) return;
    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.top < listRect.top) list.scrollTop -= listRect.top - elRect.top;
    else if (elRect.bottom > listRect.bottom) list.scrollTop += elRect.bottom - listRect.bottom;
  }, [open, activeIdx]);

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      keyboardNavRef.current = true;
      setActiveIdx((i) => Math.min(i + 1, navItems.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      keyboardNavRef.current = true;
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      keyboardNavRef.current = true;
      setActiveIdx(0);
    } else if (event.key === "End") {
      event.preventDefault();
      keyboardNavRef.current = true;
      setActiveIdx(Math.max(0, navItems.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const idx = Math.min(activeIdx, navItems.length - 1);
      if (idx >= 0) pick(navItems[idx] ?? null);
    }
  }

  return (
    <div className="min-w-36">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={toggle}
        title={value ?? "بدون مصدر (فارغ)"}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1 truncate text-right">
          {value ?? <span className="text-muted-foreground">— بدون مصدر (فارغ) —</span>}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[100] overflow-hidden rounded-md border bg-background shadow-xl"
              style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 220) }}
            >
          <div className="border-b p-2">
            <Input
              type="search"
              autoFocus
              placeholder="ابحث في الأعمدة الأصلية… (↑↓ ثم Enter)"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActiveIdx(0);
              }}
              onKeyDown={onSearchKeyDown}
              aria-label="البحث في الأعمدة الأصلية"
              aria-expanded={open}
              aria-activedescendant={`source-option-${activeIdx}`}
            />
          </div>
          <div role="listbox" aria-label={ariaLabel} data-scroll-list className="overflow-y-auto p-1" style={{ maxHeight: pos.maxH }}>
            <button
              type="button"
              role="option"
              id="source-option-0"
              aria-selected={value === null}
              data-nav-active={activeIdx === 0 || undefined}
              onMouseEnter={() => {
                keyboardNavRef.current = false;
                setActiveIdx(0);
              }}
              onClick={() => pick(null)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-right text-sm transition-colors hover:bg-muted",
                value === null && "bg-primary/10 font-bold text-primary",
                activeIdx === 0 && value !== null && "bg-muted",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-muted-foreground">— بدون مصدر (قيم فارغة) —</span>
              {value === null ? <Check className="size-4 shrink-0" /> : null}
            </button>
            {filtered.length === 0 ? (
              <p className="p-3 text-center text-sm text-muted-foreground">لا توجد أعمدة مطابقة.</p>
            ) : (
              filtered.map((s, fi) => {
                const navIndex = fi + 1;
                const usedElsewhere = (usedSources.get(s) ?? 0) > (value === s ? 1 : 0);
                const active = value === s;
                const navActive = navIndex === activeIdx;
                return (
                  <button
                    key={s}
                    type="button"
                    role="option"
                    id={`source-option-${navIndex}`}
                    aria-selected={active}
                    data-nav-active={navActive || undefined}
                    onMouseEnter={() => {
                      keyboardNavRef.current = false;
                      setActiveIdx(navIndex);
                    }}
                    onClick={() => pick(s)}
                    title={usedElsewhere ? "مربوط حاليًا بعمود آخر — اختياره سينقله إلى هنا" : s}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-right text-sm transition-colors hover:bg-muted",
                      active && "bg-primary/10 font-bold text-primary",
                      navActive && !active && "bg-muted",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {s}
                      {usedElsewhere && !active ? (
                        <span className="ms-1 text-xs text-muted-foreground">(مستخدم — سيُنقل)</span>
                      ) : null}
                    </span>
                    {active ? <Check className="size-4 shrink-0" /> : null}
                  </button>
                );
              })
            )}
            </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * صف عمود الترتيب بالسحب والإفلات فقط (مقبض السحب)، مع دعم لوحة
 * المفاتيح عبر المقبض نفسه (مسافة للرفع، أسهم للتحريك، مسافة للإفلات).
 */
function SortableColumnRow({
  row,
  index,
  expanded,
  sources,
  usedSources,
  onToggle,
  onExportName,
  onSource,
  onToggleExpand,
  onRemove,
}: {
  row: EditorRow;
  index: number;
  expanded: boolean;
  sources: string[];
  usedSources: Map<string, number>;
  onToggle: (index: number, selected: boolean) => void;
  onExportName: (index: number, value: string) => void;
  onSource: (index: number, source: string | null) => void;
  onToggleExpand: (index: number) => void;
  onRemove: ((index: number) => void) | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "border-t bg-background transition-colors hover:bg-muted/40",
        !row.selected && "opacity-55",
        isDragging && "relative z-10 border-primary shadow-xl",
      )}
    >
      <td className="p-3 text-center">
        <span
          {...attributes}
          {...listeners}
          role="button"
          tabIndex={0}
          aria-label={`تحريك العمود ${row.exportName || index + 1}: اسحب بالماوس أو ركّز ثم اضغط مسافة وحرك بالأسهم`}
          title="اسحب بالماوس — أو ركّز واضغط مسافة ثم الأسهم للتحريك بلوحة المفاتيح"
          className="inline-grid size-9 cursor-grab place-items-center rounded-lg border bg-muted/60 text-muted-foreground transition hover:border-primary/50 hover:text-primary active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </span>
      </td>
      <td className="p-3 text-center">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={row.selected}
          onChange={(e) => onToggle(index, e.target.checked)}
          aria-label={`تضمين العمود ${row.exportName || index + 1}`}
        />
      </td>
      <td className="p-3 font-bold">{index + 1}</td>
      <td className="p-3">
        <Input
          value={row.exportName}
          onChange={(e) => onExportName(index, e.target.value)}
          placeholder={row.source ?? "اسم العمود في التصدير…"}
          aria-label={`اسم العمود في التصدير رقم ${index + 1}`}
        />
      </td>
      <td className="p-3">
        <ColumnSourcePicker
          sources={sources}
          value={row.source}
          usedSources={usedSources}
          onChange={(source) => onSource(index, source)}
          ariaLabel={`العمود الأصلي المغذي لعمود التصدير ${row.exportName || index + 1}`}
        />
      </td>
      <td className="p-3">
        {row.source === null ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-xs text-muted-foreground">يُصدَّر فارغًا</span>
            {onRemove ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => onRemove(index)}
                aria-label={`حذف عمود التصدير ${row.exportName || index + 1}`}
                title="حذف عمود التصدير"
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            ) : null}
          </span>
        ) : (
          <Button
            type="button"
            variant={expanded ? "secondary" : "outline"}
            size="sm"
            onClick={() => onToggleExpand(index)}
            aria-expanded={expanded}
            title="استبدال قيم هذا العمود عند التصدير"
          >
            <ArrowLeftRight className="size-4" />
            {row.replacements.length > 0 ? `استبدال (${row.replacements.length})` : "استبدال القيم"}
          </Button>
        )}
      </td>
    </tr>
  );
}

/**
 * مؤشر خطوات عريض: الملف المصدر ← طريقة التصدير ← الحفظ والتصدير.
 */
function Stepper({
  steps,
}: {
  steps: Array<{ n: number; label: string; state: "done" | "current" | "todo" }>;
}) {
  return (
    <ol
      aria-label="خطوات التصدير المخصص"
      className="flex flex-col gap-2 rounded-2xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center"
    >
      {steps.map((step, i) => (
        <li key={step.n} className="flex min-w-0 flex-1 items-center gap-2">
          {i > 0 ? <span className="hidden h-px min-w-2 flex-1 bg-border sm:block" aria-hidden="true" /> : null}
          <span
            aria-hidden="true"
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full text-sm font-black transition",
              step.state === "done" && "bg-primary text-primary-foreground",
              step.state === "current" && "border-2 border-primary bg-primary/10 text-primary",
              step.state === "todo" && "border bg-muted text-muted-foreground",
            )}
          >
            {step.state === "done" ? <Check className="size-4" /> : step.n}
          </span>
          <span
            className={cn(
              "truncate text-sm",
              step.state === "current"
                ? "font-bold"
                : step.state === "todo"
                  ? "text-muted-foreground"
                  : "font-medium",
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * بحث ذكي في الملفات: تطبيع العربية (همزات، تاء مربوطة، تشكيل، تطويل،
 * أرقام عربية)، ومطابقة كل كلمات البحث، وترتيب النتائج بالملاءمة
 * (تطابق تام، ثم بداية الاسم، ثم كل الكلمات في الاسم، ثم في المجموعة).
 */
function fileSearchScore(
  file: ExportSourceFile,
  tokens: string[],
  normalizedQuery: string,
): number | null {
  if (!matchesNormalizedText(tokens.join(" "), `${file.fileName} ${file.groupName ?? ""}`))
    return null;
  const name = normalizeStored(file.fileName);
  if (name === normalizedQuery) return 4;
  if (normalizedQuery.length > 0 && name.startsWith(normalizedQuery)) return 3;
  if (tokens.every((token) => name.includes(token))) return 2;
  return 1;
}

/** تظليل المقاطع المطابقة داخل اسم الملف مع دعم التطبيع العربي. */
function HighlightedFileName({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  const ranges = useMemo(
    () => (trimmed ? computeHighlightRanges(text, trimmed, null) : []),
    [text, trimmed],
  );
  if (ranges.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, i) => {
    if (range.start > cursor) parts.push(<span key={`t${i}`}>{text.slice(cursor, range.start)}</span>);
    parts.push(
      <mark key={`m${i}`} className="rounded-sm bg-primary/25 font-bold text-inherit">
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>);
  return <>{parts}</>;
}

/**
 * قائمة اختيار الملف المصدر: زر يفتح لوحة مخصصة (بدل select الأصلي
 * الذي يرسم قائمته خارج سيطرة CSS في وضع RTL فتظهر مقصوصة ومشوهة)،
 * مع بحث فوري وتجميع حسب المجموعة ودعم كامل للعربية.
 */
function FileSelect({
  files,
  value,
  onChange,
}: {
  files: ExportSourceFile[];
  value: string;
  onChange: (fileId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // التمرير التلقائي للخيار النشط مخصص للتنقل بالكيبورد فقط —
  // الـ hover بالماوس يجب ألا يحرّك أي تمرير إطلاقًا.
  const keyboardNavRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open ]);

  const { grouped, resultCount } = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      const groups = new Map<string, ExportSourceFile[]>();
      for (const f of files) {
        const key = f.groupName || "بدون مجموعة";
        const bucket = groups.get(key);
        if (bucket) bucket.push(f);
        else groups.set(key, [f]);
      }
      return { grouped: [...groups.entries()], resultCount: files.length };
    }
    const tokens = normalizeQuery(trimmed);
    const normalizedQuery = normalizeStored(trimmed);
    const scored = files
      .map((f) => ({ file: f, score: fileSearchScore(f, tokens, normalizedQuery) }))
      .filter((entry): entry is { file: ExportSourceFile; score: number } => entry.score !== null)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.file.fileName.localeCompare(b.file.fileName, "ar"),
      );
    const groups = new Map<string, ExportSourceFile[]>();
    const groupScore = new Map<string, number>();
    for (const { file, score } of scored) {
      const key = file.groupName || "بدون مجموعة";
      const bucket = groups.get(key);
      if (bucket) bucket.push(file);
      else groups.set(key, [file]);
      groupScore.set(key, Math.max(groupScore.get(key) ?? 0, score));
    }
    const ordered = [...groups.entries()].sort(
      (a, b) => (groupScore.get(b[0]) ?? 0) - (groupScore.get(a[0]) ?? 0),
    );
    return { grouped: ordered, resultCount: scored.length };
  }, [files, query]);

  const selected = files.find((f) => f.fileId === value) ?? null;

  // تنقل الكيبورد: الأسهم للتحرك بين النتائج وإدخال للاختيار.
  const flatIds = useMemo(
    () => grouped.flatMap(([, list]) => list.map((f) => f.fileId)),
    [grouped],
  );

  function pickFile(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
    setActiveIdx(0);
  }

  useEffect(() => {
    setActiveIdx((current) => Math.min(current, Math.max(0, flatIds.length - 1)));
  }, [flatIds.length]);

  useEffect(() => {
    if (!open || !keyboardNavRef.current) return;
    keyboardNavRef.current = false;
    const panel = panelRef.current;
    const el = panel?.querySelector('[data-nav-active="true"]') as HTMLElement | null;
    const list = el?.closest("[data-scroll-list]") as HTMLElement | null;
    if (!list || !el) return;
    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.top < listRect.top) list.scrollTop -= listRect.top - elRect.top;
    else if (elRect.bottom > listRect.bottom) list.scrollTop += elRect.bottom - listRect.bottom;
  }, [open, activeIdx]);

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      keyboardNavRef.current = true;
      setActiveIdx((i) => Math.min(i + 1, flatIds.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      keyboardNavRef.current = true;
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      keyboardNavRef.current = true;
      setActiveIdx(0);
    } else if (event.key === "End") {
      event.preventDefault();
      keyboardNavRef.current = true;
      setActiveIdx(Math.max(0, flatIds.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const id = flatIds[activeIdx] ?? flatIds[0];
      if (id) pickFile(id);
    }
  }

  let navIdx = -1;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="الملف المصدر"
        onClick={() => {
          setActiveIdx(0);
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if ((e.key === "ArrowDown" || e.key === "Enter") && !open) {
            e.preventDefault();
            setActiveIdx(0);
            setOpen(true);
          }
        }}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1 truncate text-right">
          {selected
            ? `${selected.fileName} (${selected.rowCount.toLocaleString("en-US")} سجل)`
            : "— اختر الملف المصدر —"}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border bg-background shadow-lg">
          <div className="border-b p-2">
            <Input
              type="search"
              autoFocus
              placeholder="ابحث باسم الملف أو المجموعة… (↑↓ للتنقل، Enter للاختيار)"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIdx(0);
              }}
              onKeyDown={onSearchKeyDown}
              aria-label="البحث في الملفات"
              aria-expanded={open}
              aria-controls="file-select-listbox"
              aria-activedescendant={flatIds[activeIdx] ? `file-option-${flatIds[activeIdx]}` : undefined}
            />
            {query.trim() ? (
              <p className="px-1 pt-1.5 text-xs text-muted-foreground" role="status">
                {resultCount > 0 ? `${resultCount.toLocaleString("en-US")} نتيجة مطابقة` : "لا توجد نتائج مطابقة"}
              </p>
            ) : null}
          </div>
          <div ref={panelRef} role="listbox" id="file-select-listbox" aria-label="الملفات المتاحة" data-scroll-list className="max-h-72 overflow-y-auto p-1">
            {grouped.length === 0 ? (
              <p className="p-3 text-center text-sm text-muted-foreground">لا توجد ملفات مطابقة.</p>
            ) : (
              grouped.map(([group, list]) => (
                <div key={group} className="py-1">
                  <p className="px-2 py-1 text-xs font-bold text-muted-foreground">{group}</p>
                  {list.map((f) => {
                    const active = f.fileId === value;
                    navIdx += 1;
                    const navActive = navIdx === activeIdx;
                    return (
                      <button
                        key={f.fileId}
                        id={`file-option-${f.fileId}`}
                        type="button"
                        role="option"
                        aria-selected={active}
                        data-nav-active={navActive || undefined}
                        onMouseEnter={() => {
                          keyboardNavRef.current = false;
                          setActiveIdx(navIdx);
                        }}
                        onClick={() => pickFile(f.fileId)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-right text-sm transition-colors hover:bg-muted",
                          active && "bg-primary/10 font-bold text-primary",
                          navActive && !active && "bg-muted",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">
                            <HighlightedFileName text={f.fileName} query={query} />
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {f.rowCount.toLocaleString("en-US")} سجل
                          </span>
                        </span>
                        {active ? <Check className="size-4 shrink-0" /> : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * تصدير مخصص: اختيار ملف مصدر، تحديد أسماء الأعمدة وترتيبها،
 * حفظ التشكيلة كقالب، ثم التصدير السريع حسب القالب.
 */
export function CustomExportPage() {
  const [files, setFiles] = useState<ExportSourceFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [templates, setTemplates] = useState<ExportTemplate[]>([]);
  const [loadedTemplateId, setLoadedTemplateId] = useState<string | null>(null);
  const [pickedTemplateId, setPickedTemplateId] = useState<string | null>(null);
  const [mode, setMode] = useState<"template" | "new" | "import">("template");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [availableSources, setAvailableSources] = useState<string[]>([]);
  const [columnFilter, setColumnFilter] = useState("");
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importSheets, setImportSheets] = useState<ImportSheetHeaders[] | null>(null);
  const [importSheetName, setImportSheetName] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const extraCounter = useRef(0);
  const [templateName, setTemplateName] = useState("");
  const [markEdits, setMarkEdits] = useState(false);
  const [canView, setCanView] = useState(false);
  const [canExport, setCanExport] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { tryAcquire, release } = useExportLock();

  // تحميل الملفات المصدر + الصلاحيات.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [list, me] = await Promise.all([customExportService.listFiles(), authService.me()]);
        if (!active) return;
        setFiles(list);
        const perms = me?.permissions ?? [];
        setCanView(hasPermission(perms, "customExport.view") || hasPermission(perms, "customExport.run"));
        setCanExport(hasPermission(perms, "customExport.run"));
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "تعذر تحميل الملفات.");
      } finally {
        if (active) setLoadingFiles(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // تحميل أعمدة الملف المحدد + قوالبه.
  useEffect(() => {
    if (!selectedFileId) {
      setRows([]);
      setTemplates([]);
      setAvailableSources([]);
      setColumnFilter("");
      setLoadedTemplateId(null);
      setPickedTemplateId(null);
      setExpandedSource(null);
      setTemplateName("");
      setImportFileName(null);
      setImportSheets(null);
      setImportSheetName("");
      setImportError(null);
      setMode("template");
      return;
    }
    let active = true;
    setLoadingColumns(true);
    setLoadingTemplates(true);
    (async () => {
      try {
        const [cols, temps] = await Promise.all([
          customExportService.getColumns(selectedFileId),
          customExportService.listTemplates(selectedFileId),
        ]);
        if (!active) return;
        extraCounter.current = 0;
        // الحالة الافتراضية: اسم التصدير مطابق للعمود الأصلي.
        setRows(
          cols.columns.map((c) => ({
            id: c.headerRaw,
            exportName: c.headerRaw,
            source: c.headerRaw as string | null,
            selected: true,
            replacements: [],
          })),
        );
        setAvailableSources(cols.columns.map((c) => c.headerRaw));
        setTemplates(temps);
        setLoadedTemplateId(null);
        setExpandedSource(null);
        // وضع البداية: قالب محفوظ عند وجود قوالب، وإلا إنشاء جديد.
        setMode(temps.length > 0 ? "template" : "new");
        setPickedTemplateId(temps.length > 0 ? temps[0].id : null);
      } catch (err) {
        if (active) {
          setRows([]);
          setTemplates([]);
          toast.error(err instanceof Error ? err.message : "تعذر تحميل أعمدة الملف.");
        }
      } finally {
        if (active) {
          setLoadingColumns(false);
          setLoadingTemplates(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedFileId]);

  const selectedFile = useMemo(
    () => files.find((f) => f.fileId === selectedFileId) ?? null,
    [files, selectedFileId],
  );

  const loadedTemplate = useMemo(
    () => templates.find((t) => t.id === loadedTemplateId) ?? null,
    [templates, loadedTemplateId],
  );

  const selectedColumns: ExportTemplateColumn[] = useMemo(
    () =>
      rows
        .filter((r) => r.selected)
        .map((r) => {
          const name = r.exportName.trim();
          return r.source === null
            ? { source: null, alias: name, replacements: [] }
            : {
                source: r.source,
                alias: name === r.source ? null : name,
                replacements: r.replacements
                  .filter((rep) => rep.from.trim())
                  .map((rep) => ({ from: rep.from.trim(), to: rep.to.trim() })),
              };
        }),
    [rows],
  );

  /** الأعمدة الأصلية المستخدمة في صفوف أخرى (لتعطيلها في قوائم الاختيار). */
  const usedSources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (r.source) counts.set(r.source, (counts.get(r.source) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  /** فهارس الصفوف الظاهرة حسب تصفية الأعمدة (تطبيع عربي). */
  const visibleIndices = useMemo(() => {
    const needle = normalizeStored(columnFilter.trim());
    if (!needle) return rows.map((_, i) => i);
    return rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) =>
        normalizeStored(r.exportName).includes(needle) ||
        (r.source ? normalizeStored(r.source).includes(needle) : false),
      )
      .map(({ i }) => i);
  }, [rows, columnFilter]);

  const steps: Array<{ n: number; label: string; state: "done" | "current" | "todo" }> = [
    { n: 1, label: "الملف المصدر", state: selectedFileId ? "done" : "current" },
    {
      n: 2,
      label: "طريقة التصدير",
      state: !selectedFileId
        ? "todo"
        : mode === "template"
          ? pickedTemplateId
            ? "done"
            : "current"
          : selectedColumns.length > 0
            ? "done"
            : "current",
    },
    {
      n: 3,
      label: "الحفظ والتصدير",
      state: !selectedFileId || mode === "template" || !canExport ? "todo" : "current",
    },
  ];

  /** تحقق client-side قبل الحفظ/التصدير: أسماء التصدير مطلوبة وفريدة. */
  function validateEditor(): string | null {
    const included = rows.filter((r) => r.selected);
    if (included.length === 0) return "حدد عمودًا واحدًا على الأقل للتصدير.";
    const seen = new Set<string>();
    for (const r of included) {
      const name = r.exportName.trim();
      if (!name) return "أدخل اسم العمود في التصدير لكل عمود محدد.";
      if (name.length > 500) return `اسم العمود «${name}» طويل جدًا.`;
      const key = name.toLowerCase();
      if (seen.has(key)) return `اسم العمود «${name}» مكرر في التصدير.`;
      seen.add(key);
    }
    return null;
  }

  function setAll(selected: boolean) {
    setRows((current) => current.map((r) => ({ ...r, selected })));
  }

  function resetOrder() {
    setRows((current) =>
      [...current].sort((a, b) =>
        (a.exportName || a.source || "").localeCompare(b.exportName || b.source || "", "ar"),
      ),
    );
  }

  /** بدء قالب فارغ: إعادة الصفوف للوضع الافتراضي وفك ارتباط أي قالب محمّل. */
  function resetEditorToDefaults() {
    extraCounter.current = 0;
    setRows(
      availableSources.map((header) => ({
        id: header,
        exportName: header,
        source: header as string | null,
        selected: true,
        replacements: [],
      })),
    );
    setLoadedTemplateId(null);
    setTemplateName("");
    setExpandedSource(null);
    setColumnFilter("");
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    if (!event.over || event.active.id === event.over.id) return;
    setRows((current) => {
      const oldIndex = current.findIndex((r) => r.id === event.active.id);
      const newIndex = current.findIndex((r) => r.id === event.over?.id);
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  }

  function handleToggleRow(index: number, selected: boolean) {
    setRows((current) => current.map((r, i) => (i === index ? { ...r, selected } : r)));
  }

  function handleExportNameRow(index: number, value: string) {
    setRows((current) => current.map((r, i) => (i === index ? { ...r, exportName: value } : r)));
  }

  function handleSourceRow(index: number, source: string | null) {
    setRows((current) =>
      current.map((r, i) => {
        if (i === index) return { ...r, source };
        // عمود مختار من قبل: يُفك ارتباطه عن الصف القديم تلقائيًا ويرتبط بالجديد.
        if (source !== null && r.source === source) return { ...r, source: null };
        return r;
      }),
    );
  }

  function handleReplacementsRow(index: number, replacements: Array<{ from: string; to: string }>) {
    setRows((current) => current.map((r, i) => (i === index ? { ...r, replacements } : r)));
  }

  const activeDragRow = activeDragId ? (rows.find((r) => r.id === activeDragId) ?? null) : null;

  function loadTemplate(template: ExportTemplate) {
    const mappedSources = new Set<string>();
    const ordered: EditorRow[] = [];
    for (const col of template.columns) {
      // عمود فارغ محفوظ: يعاد إنشاؤه بمعرف مؤقت جديد.
      if (!col.source) {
        extraCounter.current += 1;
        ordered.push({
          id: `__extra_${extraCounter.current}`,
          exportName: col.alias ?? "",
          source: null,
          selected: true,
          replacements: [],
        });
        continue;
      }
      if (!availableSources.includes(col.source)) continue;
      mappedSources.add(col.source);
      ordered.push({
        id: col.source,
        exportName: col.alias ?? col.source,
        source: col.source,
        selected: true,
        replacements: (col.replacements ?? []).map((rep) => ({ from: rep.from, to: rep.to })),
      });
    }
    // الأعمدة الأصلية غير المربوطة في القالب تُلحق في النهاية غير محددة.
    for (const header of availableSources) {
      if (mappedSources.has(header)) continue;
      ordered.push({
        id: header,
        exportName: header,
        source: header,
        selected: false,
        replacements: [],
      });
    }
    setRows(ordered);
    setLoadedTemplateId(template.id);
    setTemplateName(template.name);
    setExpandedSource(null);
    setColumnFilter("");
    setMode("new");
    toast.success(`تم تحميل القالب «${template.name}» في محرر قالب جديد.`);
  }

  function handleAddExportColumn() {
    if (rows.length >= 100) {
      toast.error("عدد الأعمدة يتجاوز الحد المسموح (100).");
      return;
    }
    extraCounter.current += 1;
    setRows((current) => [
      ...current,
      {
        id: `__extra_${extraCounter.current}`,
        exportName: "",
        source: null,
        selected: true,
        replacements: [],
      },
    ]);
  }

  function handleRemoveRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  /** تعبئة المحرر من ورقة مستوردة: الصفوف بأسمائها وترتيبها،
   * والمصادر مقترحة بالتشابه (كل مصدر يُستخدم مرة واحدة). */
  function fillFromImport(sheet: ImportSheetHeaders) {
    const free = new Set(availableSources);
    const mapped: EditorRow[] = [];
    let auto = 0;
    for (const raw of sheet.headers) {
      const name = raw.trim();
      if (!name) continue;
      extraCounter.current += 1;
      const suggestion = suggestSource(name, [...free]);
      if (suggestion) {
        free.delete(suggestion);
        auto += 1;
      }
      mapped.push({
        id: `__imp_${extraCounter.current}`,
        exportName: name,
        source: suggestion,
        selected: true,
        replacements: [],
      });
    }
    setRows(mapped);
    setLoadedTemplateId(null);
    setExpandedSource(null);
    setColumnFilter("");
    toast.success(
      mapped.length === 0
        ? "الورقة المحددة بلا عناوين — اختر ورقة أخرى."
        : `تمت تعبئة ${mapped.length} عمود — رُبط ${auto} منها تلقائيًا. راجعها وعدّل بحرية قبل الحفظ.`,
    );
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || importing) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setImportError("الصيغ المقبولة هي XLSX وXLS فقط.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImportError("حجم ملف الاستيراد يتجاوز الحد المسموح وهو 10 ميغابايت.");
      return;
    }
    setImporting(true);
    setImportProgress(0);
    setImportError(null);
    setImportSheets(null);
    setImportSheetName("");
    try {
      const sheets = await customExportService.inspectImport(file, setImportProgress);
      setImportFileName(file.name);
      setImportSheets(sheets);
      const first = sheets.find((s) => s.headers.length > 0) ?? sheets[0];
      if (first) {
        setImportSheetName(first.sheetName);
        fillFromImport(first);
      } else {
        setImportError("لا يحتوي المصنف على أي أوراق قابلة للقراءة.");
      }
    } catch (err) {
      setImportFileName(file.name);
      setImportError(err instanceof Error ? err.message : "تعذر قراءة ملف الاستيراد.");
    } finally {
      setImporting(false);
    }
  }

  function handleImportSheetChange(sheetName: string) {
    setImportSheetName(sheetName);
    const sheet = importSheets?.find((s) => s.sheetName === sheetName);
    if (sheet) fillFromImport(sheet);
  }

  async function refreshTemplates() {
    if (!selectedFileId) return;
    try {
      const list = await customExportService.listTemplates(selectedFileId);
      setTemplates(list);
      setPickedTemplateId((current) =>
        list.some((t) => t.id === current) ? current : (list[0]?.id ?? null),
      );
    } catch {
      // القائمة الحالية تبقى كما هي عند فشل التحديث.
    }
  }

  async function handleSave() {
    if (!selectedFileId || saving) return;
    const name = templateName.trim();
    if (name.length < 2) {
      toast.error("أدخل اسمًا واضحًا للقالب (حرفان على الأقل).");
      return;
    }
    const validationError = validateEditor();
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSaving(true);
    try {
      if (loadedTemplateId) {
        // تعديل قالب محمّل: يُحدَّث القالب نفسه (بما فيه إعادة التسمية).
        const updated = await customExportService.update(loadedTemplateId, name, selectedColumns);
        setTemplateName(updated.name);
        toast.success(`تم تحديث القالب «${updated.name}».`);
      } else {
        const created = await customExportService.create(selectedFileId, name, selectedColumns);
        setLoadedTemplateId(created.id);
        toast.success(`تم حفظ القالب «${created.name}».`);
        await refreshTemplates();
        // بعد الحفظ ينتقل المستخدم إلى وضع القوالب مع تحديده مباشرة.
        setPickedTemplateId(created.id);
        setMode("template");
        return;
      }
      await refreshTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حفظ القالب.");
    } finally {
      setSaving(false);
    }
  }

  /** حفظ التشكيلة الحالية كقالب جديد مستقل (يبقى القالب المحمّل دون مساس). */
  async function handleSaveAsNew() {
    if (!selectedFileId || saving) return;
    const name = templateName.trim();
    if (name.length < 2) {
      toast.error("أدخل اسمًا واضحًا للقالب (حرفان على الأقل).");
      return;
    }
    const validationError = validateEditor();
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSaving(true);
    try {
      const created = await customExportService.create(selectedFileId, name, selectedColumns);
      setLoadedTemplateId(created.id);
      toast.success(`تم حفظ القالب «${created.name}».`);
      await refreshTemplates();
      setPickedTemplateId(created.id);
      setMode("template");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حفظ القالب.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await customExportService.remove(id);
      if (loadedTemplateId === id) setLoadedTemplateId(null);
      if (pickedTemplateId === id) setPickedTemplateId(null);
      await refreshTemplates();
      toast.success(`تم حذف القالب «${name}».`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حذف القالب.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleExportCurrent() {
    if (!selectedFileId || exporting) return;
    const validationError = validateEditor();
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (!tryAcquire()) {
      toast.info("يوجد تصدير جارٍ — انتظر انتهاءه ثم أعد المحاولة.");
      return;
    }
    setExporting(true);
    try {
      const { blob, filename } = await customExportService.exportAdhoc(
        selectedFileId,
        selectedColumns,
        markEdits,
      );
      downloadBlob(blob, filename, "custom-export.xlsx");
      toast.success("اكتمل تصدير الملف.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تصدير الملف.");
    } finally {
      setExporting(false);
      release();
    }
  }

  // اختصارات الكيبورد: Ctrl/Cmd+S للحفظ، Ctrl/Cmd+Enter للتصدير.
  // تعمل حتى أثناء الكتابة في الحقول؛ النسخ واللصق لا تتأثر.
  const saveRef = useRef(handleSave);
  const exportRef = useRef(handleExportCurrent);
  saveRef.current = handleSave;
  exportRef.current = handleExportCurrent;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      // الاختصارات خاصة بوضعي الإنشاء والاستيراد (حيث يوجد محرر ظاهر).
      if (!selectedFileId || !canExport || mode === "template") return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        if (!saving) void saveRef.current();
      } else if (key === "enter") {
        event.preventDefault();
        if (!exporting) void exportRef.current();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [saving, exporting, selectedFileId, canExport, mode]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="استيراد وتصدير"
        title="تصدير مخصص"
        description="اختر الملف المصدر، حدد أسماء الأعمدة وترتيبها، احفظ التشكيلة كقالب، ثم صدّر البيانات حسب النموذج الجديد — أو صدّر بسرعة حسب قالب محفوظ."
      />
      <Stepper steps={steps} />

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}

      {loadingFiles ? <LoadingScreen message="جارٍ تحميل الملفات…" /> : null}

      {!loadingFiles && !error ? (
        !canView ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            لا تملك صلاحية عرض قسم التصدير المخصص.
          </p>
        ) : (
        <>
          <Card className="rounded-2xl border-2 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-sm font-black text-primary">1</span>
                اختيار الملف المصدر
              </CardTitle>
              <CardDescription>اختر الملف الذي ستُصدَّر بياناته بترتيب أعمدة مخصص.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <FileSelect files={files} value={selectedFileId} onChange={setSelectedFileId} />
              {selectedFile ? (
                <p className="text-xs text-muted-foreground">
                  المجموعة: {selectedFile.groupName || "—"} •{" "}
                  {selectedFile.rowCount.toLocaleString("en-US")} سجل
                </p>
              ) : null}
            </CardContent>
          </Card>

          {selectedFileId ? (
            <Card className="rounded-2xl border-2 shadow-md">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-sm font-black text-primary">2</span>
                  طريقة التصدير
                </CardTitle>
                <CardDescription>
                  اختر قالبًا محفوظًا للتصدير السريع، أو أنشئ قالبًا جديدًا يدويًا، أو استورده من ملف إكسل.
                </CardDescription>
                <div role="radiogroup" aria-label="طريقة التصدير" className="grid gap-2 pt-2 md:grid-cols-3">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={mode === "template"}
                    onClick={() => setMode("template")}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border-2 p-3 text-right transition-all",
                      mode === "template"
                        ? "border-primary/60 bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/30",
                    )}
                  >
                    <FileSpreadsheet className="size-6 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block font-bold">
                        استخدام قالب محفوظ
                        {templates.length > 0 ? ` (${templates.length})` : ""}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        اختر من قوالب هذا الملف وصدّر بسرعة
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={mode === "new"}
                    onClick={() => setMode("new")}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border-2 p-3 text-right transition-all",
                      mode === "new"
                        ? "border-primary/60 bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/30",
                    )}
                  >
                    <Plus className="size-6 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block font-bold">إنشاء قالب جديد</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        حدد الأعمدة ورتبها وسمّها ثم احفظها كقالب
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={mode === "import"}
                    onClick={() => setMode("import")}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border-2 p-3 text-right transition-all",
                      mode === "import"
                        ? "border-primary/60 bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/30",
                    )}
                  >
                    <FileUp className="size-6 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block font-bold">استيراد قالب</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        ارفع ملف إكسل واقترح الربط من عناوينه
                      </span>
                    </span>
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                {mode === "new" || mode === "import" ? (
                  <>
                    {mode === "import" ? (
                      <div className="mb-3 space-y-3 rounded-xl border border-dashed border-primary/50 bg-primary/5 p-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                          <FilePicker
                            fileName={importFileName}
                            buttonLabel={importing ? "جارٍ الرفع…" : "اختيار ملف إكسل"}
                            accept=".xlsx,.xls"
                            disabled={importing}
                            onChange={(e) => void handleImportFile(e)}
                          />
                          {importing ? (
                            <span className="flex shrink-0 items-center gap-2 text-sm font-bold text-primary">
                              <LoaderCircle className="size-4 animate-spin" />
                              <span className="ltr-numbers">{importProgress}%</span>
                            </span>
                          ) : null}
                        </div>
                        {importError ? (
                          <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-xs font-semibold text-destructive">
                            {importError}
                          </p>
                        ) : null}
                        {importSheets && importSheets.length > 0 ? (
                          <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <label htmlFor="import-sheet" className="shrink-0 text-sm font-bold">
                              ورقة الإكسل المطلوبة:
                            </label>
                            <select
                              id="import-sheet"
                              className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:w-auto md:min-w-56"
                              value={importSheetName}
                              onChange={(e) => handleImportSheetChange(e.target.value)}
                              aria-label="ورقة الإكسل المطلوبة"
                            >
                              {importSheets.map((s) => (
                                <option key={s.sheetName} value={s.sheetName}>
                                  {s.sheetName} ({s.columnCount.toLocaleString("en-US")} عمود)
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                        <p className="text-xs leading-6 text-muted-foreground">
                          يُقرأ السطر الأول من الورقة كعناوين، فيُعبَّأ الجدول أدناه بعددها وترتيبها وأسمائها،
                          وتُقترح الأعمدة الأصلية بالتشابه — ثم تعدّل القالب بحرية قبل حفظه.
                        </p>
                      </div>
                    ) : null}
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Badge className="bg-primary/10 text-primary">{selectedColumns.length} محدد</Badge>
                      <Button type="button" variant="outline" size="sm" onClick={() => setAll(true)}>
                        تحديد الكل
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setAll(false)}>
                        إلغاء الكل
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={resetOrder}>
                        ترتيب أبجدي
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddExportColumn}
                        title="إضافة صف جديد: اكتب اسم عمود التصدير ثم اختر عموده الأصلي (أو اتركه فارغًا)"
                      >
                        <Plus className="size-4" />
                        إضافة عمود تصدير
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={resetEditorToDefaults}
                        title="إعادة الجدول للوضع الافتراضي وفك ارتباط أي قالب محمّل لبدء قالب جديد"
                      >
                        بدء قالب فارغ
                      </Button>
                    </div>
                    <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
                      <Input
                        type="search"
                        value={columnFilter}
                        onChange={(e) => setColumnFilter(e.target.value)}
                        placeholder="تصفية الأعمدة بالاسم…"
                        aria-label="تصفية أعمدة الجدول"
                        className="md:max-w-xs"
                      />
                      {columnFilter.trim() ? (
                        <span className="text-xs text-muted-foreground">
                          عرض {visibleIndices.length.toLocaleString("en-US")} من {rows.length.toLocaleString("en-US")}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          المرجع هو اسم عمود التصدير (يمين) — اختر له العمود الأصلي من القائمة (يسار)
                        </span>
                      )}
                    </div>
                {loadingColumns ? (
                  <LoadingScreen message="جارٍ تحميل الأعمدة…" />
                ) : rows.length === 0 ? (
                  <EmptyState title="لا توجد أعمدة" description="تعذر تحميل أعمدة هذا الملف." />
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragCancel={() => setActiveDragId(null)}
                  >
                    <SortableContext
                      items={visibleIndices.map((i) => rows[i].id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="overflow-x-auto rounded-2xl border shadow-sm">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 z-10 bg-muted/90 shadow-sm backdrop-blur">
                            <tr>
                              <th className="w-12 p-3 text-right" title="اسحب أي عمود من هنا لوضعه في الترتيب الصحيح">اسحب</th>
                              <th className="w-12 p-3 text-right">تضمين</th>
                              <th className="w-12 p-3 text-right">#</th>
                              <th className="p-3 text-right">اسم العمود في التصدير</th>
                              <th className="p-3 text-right">اسم العمود الأصلي</th>
                              <th className="p-3 text-right">استبدال القيم</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleIndices.map((index) => {
                              const row = rows[index];
                              return (
                                <Fragment key={row.id}>
                                <SortableColumnRow
                                  row={row}
                                  index={index}
                                  expanded={expandedSource === row.id}
                                  sources={availableSources}
                                  usedSources={usedSources}
                                  onToggle={handleToggleRow}
                                  onExportName={handleExportNameRow}
                                  onSource={handleSourceRow}
                                  onToggleExpand={(i) =>
                                    setExpandedSource((current) =>
                                      current === rows[i]?.id ? null : (rows[i]?.id ?? null),
                                    )
                                  }
                                  onRemove={row.source === null ? handleRemoveRow : null}
                                />
                                {expandedSource === row.id && row.source !== null ? (
                                  <tr className="border-t bg-muted/30">
                                    <td colSpan={6} className="p-3">
                                      <ReplacementEditor
                                        row={row}
                                        index={index}
                                        onChange={handleReplacementsRow}
                                      />
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </SortableContext>
                    <DragOverlay>
                      {activeDragRow ? (
                        <div className="flex items-center gap-2 rounded-lg border border-primary bg-background px-3 py-2 text-sm font-bold shadow-xl">
                          <GripVertical className="size-4 text-muted-foreground" />
                          <span className="truncate">{activeDragRow.exportName || activeDragRow.source || "عمود جديد"}</span>
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                )}
                  </>
                ) : (
                  <>
                    {loadingTemplates ? (
                      <LoadingScreen message="جارٍ تحميل القوالب…" />
                    ) : templates.length === 0 ? (
                      <EmptyState
                        title="لا توجد قوالب محفوظة لهذا الملف"
                        description="أنشئ قالبًا جديدًا بتحديد الأعمدة وترتيبها ثم احفظه لاستخدامه هنا لاحقًا."
                        action={
                          <Button type="button" onClick={() => setMode("new")}>
                            <Plus className="size-4" />
                            إنشاء قالب جديد
                          </Button>
                        }
                      />
                    ) : (
                      <div className="grid gap-3">
                        {templates.map((template) => {
                          const picked = pickedTemplateId === template.id;
                          return (
                            <div
                              key={template.id}
                              className={cn(
                                "rounded-xl border-2 p-4 transition-all",
                                picked
                                  ? "border-primary/60 bg-primary/5"
                                  : "border-border hover:border-primary/40 hover:bg-muted/30",
                              )}
                            >
                              <button
                                type="button"
                                role="radio"
                                aria-checked={picked}
                                onClick={() => setPickedTemplateId(template.id)}
                                className="flex w-full items-center gap-3 text-right"
                                aria-label={`اختيار القالب ${template.name}`}
                              >
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    "grid size-5 shrink-0 place-items-center rounded-full border-2",
                                    picked ? "border-primary" : "border-muted-foreground/40",
                                  )}
                                >
                                  {picked ? <span className="size-2.5 rounded-full bg-primary" /> : null}
                                </span>
                                <span className="min-w-0 flex-1 truncate font-bold">{template.name}</span>
                                <Badge className="shrink-0 bg-primary/10 text-primary">
                                  {template.columns.length} عمود
                                </Badge>
                              </button>
                              {picked ? (
                                <div className="mt-3 space-y-3 border-t pt-3">
                                  <ol className="grid max-h-48 gap-1 overflow-y-auto rounded-lg bg-muted/40 p-3 text-sm md:grid-cols-2">
                                    {template.columns.map((col, index) => (
                                      <li key={`${col.source ?? "extra"}-${index}`} className="flex items-center gap-2 truncate">
                                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-black text-primary">
                                          {index + 1}
                                        </span>
                                        <span className="truncate font-medium">
                                          {col.alias || col.source}
                                          {col.alias && col.source && col.alias !== col.source ? (
                                            <span className="font-normal text-muted-foreground"> ← {col.source}</span>
                                          ) : null}
                                        </span>
                                        {!col.source ? (
                                          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-secondary-foreground">
                                            إضافي فارغ
                                          </span>
                                        ) : null}
                                        {(col.replacements?.length ?? 0) > 0 ? (
                                          <span className="shrink-0 text-[11px] text-muted-foreground">
                                            ({col.replacements!.length} استبدال)
                                          </span>
                                        ) : null}
                                      </li>
                                    ))}
                                  </ol>
                                  <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted/50">
                                    <input
                                      type="checkbox"
                                      className="size-4 accent-primary"
                                      checked={markEdits}
                                      onChange={(e) => setMarkEdits(e.target.checked)}
                                    />
                                    تعليم القيم التي تم تعديلها
                                  </label>
                                  <div className="flex flex-wrap gap-2">
                                    {canExport ? (
                                      <ExportButton
                                        href={customExportService.exportUrl(template.id, markEdits)}
                                        label="تصدير سريع حسب القالب"
                                      />
                                    ) : null}
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => loadTemplate(template)}
                                    >
                                      <PencilLine className="size-4" />
                                      تعديل في محرر قالب جديد
                                    </Button>
                                    {canExport ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={deletingId === template.id}
                                        onClick={() => void handleDelete(template.id, template.name)}
                                        aria-label={`حذف القالب ${template.name}`}
                                      >
                                        {deletingId === template.id ? (
                                          <LoaderCircle className="size-4 animate-spin" />
                                        ) : (
                                          <Trash2 className="size-4 text-destructive" />
                                        )}
                                        حذف
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          {selectedFileId && canExport && mode !== "template" ? (
            <Card className="rounded-2xl border-2 shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-sm font-black text-primary">3</span>
                  حفظ القالب والتصدير
                </CardTitle>
                <CardDescription>
                  {loadedTemplate
                    ? `تحرير القالب «${loadedTemplate.name}» — أي تعديل على الجدول أعلاه سيُحفظ فيه عند التحديث.`
                    : "احفظ الترتيب الحالي كقالب باسم واضح لإعادة التصدير السريع لاحقًا، أو صدّر مباشرة حسب التشكيلة الحالية."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 md:flex-row">
                  <Input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="اسم القالب — مثال: ترتيب أعمدة التقرير الشهري"
                    aria-label="اسم القالب"
                    maxLength={120}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={saving || selectedColumns.length === 0}
                    onClick={() => void handleSave()}
                  >
                    {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                    {saving ? "جارٍ الحفظ…" : loadedTemplateId ? "تحديث القالب" : "حفظ قالب جديد"}
                  </Button>
                  {loadedTemplateId ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving || selectedColumns.length === 0}
                      onClick={() => void handleSaveAsNew()}
                      title="حفظ التشكيلة الحالية كقالب جديد مستقل دون تعديل القالب المحمّل"
                    >
                      <Plus className="size-4" />
                      حفظ كقالب جديد
                    </Button>
                  ) : null}
                </div>
                <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted/50">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={markEdits}
                    onChange={(e) => setMarkEdits(e.target.checked)}
                  />
                  تعليم القيم التي تم تعديلها
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={exporting || selectedColumns.length === 0} onClick={() => void handleExportCurrent()}>
                    {exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                    {exporting ? "جارٍ تصدير الملف…" : "تصدير حسب التشكيلة الحالية"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

        </>
        )
      ) : null}
    </div>
  );
}
