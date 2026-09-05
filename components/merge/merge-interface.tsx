"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MappingForm } from "@/components/merge/mapping-form";
import { ResultsView, type MergeClientResult } from "@/components/merge/results-view";
import { LoaderCircle, Play, RefreshCw, Upload } from "lucide-react";
import {
  MERGE_RULES,
  type MergeFieldKey,
  type MergeInspection,
  type MergeMapping,
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

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "حدث خطأ غير متوقع.");
  return payload;
}

const steps = ["رفع الملفين وتحديد الأعمدة", "النتائج"];

/** Upload with real byte progress (fetch cannot report upload progress). */
function uploadWithProgress(
  file: File,
  onProgress: (percent: number) => void,
): Promise<MergeInspection> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.set("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/merge/inspect");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      onProgress(100);
      try {
        const payload = JSON.parse(xhr.responseText) as MergeInspection & { error?: string };
        if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
        else reject(new Error(payload.error ?? "تعذر فحص الملف."));
      } catch {
        reject(new Error("تعذر فحص الملف."));
      }
    };
    xhr.onerror = () => reject(new Error("تعذر الاتصال بالخادم."));
    xhr.send(form);
  });
}

/** Reads the NDJSON progress stream of /api/merge/run into the final result. */
async function runMergeWithProgress(
  body: unknown,
  onProgress: (percent: number, detail: string | null) => void,
): Promise<MergeClientResult> {
  const response = await fetch("/api/merge/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("ndjson")) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "تعذر تنفيذ الدمج.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("تعذر تنفيذ الدمج.");
  const decoder = new TextDecoder();
  let buffer = "";
  let result: MergeClientResult | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        const message = JSON.parse(line) as
          | { type: "progress"; percent: number; detail: string | null }
          | { type: "result"; payload: MergeClientResult }
          | { type: "error"; error: string };
        if (message.type === "progress") onProgress(message.percent, message.detail);
        else if (message.type === "result") {
          result = message.payload;
          onProgress(100, "اكتمل الدمج.");
        } else throw new Error(message.error);
      }
      newline = buffer.indexOf("\n");
    }
  }
  if (!result) throw new Error("تعذر تنفيذ الدمج.");
  return result;
}

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
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setState((current) => ({ ...current, file, error: "الصيغ المقبولة هي XLSX وXLS فقط." }));
      return;
    }
    setState((current) => ({ ...current, file, uploading: true, progress: 0, error: null }));
    try {
      const payload = await uploadWithProgress(file, (progress) =>
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
    if (!state.inspection) return;
    setState((current) => ({ ...current, uploading: true, error: null }));
    try {
      const selected = await postJson<MergeInspection["selected"]>("/api/merge/sheet", {
        token: state.inspection.token,
        sheetName,
      });
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
    <Card>
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

export function MergeInterface() {
  const [left, setLeft] = useState<TableState>(emptyTable());
  const [right, setRight] = useState<TableState>(emptyTable());
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [runDetail, setRunDetail] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<MergeClientResult | null>(null);
  const [step, setStep] = useState(0);

  const ready = Boolean(
    left.inspection && right.inspection && !left.uploading && !right.uploading && !running,
  );
  const hints = ruleHints(left.mapping, right.mapping);
  const activeRules = hints.filter((hint) => hint.ready);
  const canRun = ready && activeRules.length > 0;

  async function run() {
    if (!left.inspection || !right.inspection) return;
    setRunning(true);
    setRunProgress(0);
    setRunDetail("بدء الدمج…");
    setRunError(null);
    try {
      const payload = await runMergeWithProgress(
        {
          left: { token: left.inspection.token, sheetName: left.sheetName, mapping: left.mapping },
          right: {
            token: right.inspection.token,
            sheetName: right.sheetName,
            mapping: right.mapping,
          },
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

          <section className="space-y-4" aria-label="تحديد أعمدة الربط">
            <h2 className="text-lg font-black">تحديد الأعمدة</h2>
            <p className="text-sm text-muted-foreground">
              تُقترح الأعمدة تلقائياً من عناوين Excel ويمكن تعديلها. حدد أي عمود يمثل كل حقل،
              وإذا لم يتوفر الحقل في الملف اتركه «غير مربوط» — وستُطبق القواعد المتاحة فقط. أدخل
              إما الاسم الثلاثي أو (الاسم واسم الأب والنسبة)، ولا يمكن الجمع بينهما. الربط مؤكد
              فقط: لا يُربط أي صف إلا بتطابق التأكد (الكلمة الأولى من اسم الأم لقاعدتي الاسم،
              والكلمة الأولى من الاسم الثلاثي — أو الاسم عند غيابه — لبقية القواعد)، والصفوف بلا
              تأكد تبقى بلا مفتاح ولا تُصدَّر كغير مؤكد.
            </p>
            <div className="grid gap-5 xl:grid-cols-2">
              <MappingForm
                title="الجدول الأول"
                headers={left.headers}
                mapping={left.mapping}
                rowCount={left.rowCount}
                onChange={(mapping) => setLeft((current) => ({ ...current, mapping }))}
              />
              <MappingForm
                title="الجدول الثاني"
                headers={right.headers}
                mapping={right.mapping}
                rowCount={right.rowCount}
                onChange={(mapping) => setRight((current) => ({ ...current, mapping }))}
              />
            </div>
          </section>

          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold">القواعد التي ستُطبق</h3>
                {activeRules.length ? (
                  <Badge variant="secondary">{activeRules.length} قواعد جاهزة</Badge>
                ) : (
                  <Badge variant="outline">لا توجد قواعد جاهزة بعد</Badge>
                )}
              </div>
              <ul className="grid gap-2 text-sm md:grid-cols-2">
                {hints.map((hint) => {
                  const rule = MERGE_RULES.find((entry) => entry.key === hint.key)!;
                  return (
                    <li
                      key={hint.key}
                      className={`flex items-start gap-2 rounded-lg border p-3 ${
                        hint.ready ? "border-primary/30 bg-primary/5" : "opacity-60"
                      }`}
                    >
                      {hint.ready ? (
                        <span className="mt-1 size-2 rounded-full bg-primary" />
                      ) : (
                        <span className="mt-1 size-2 rounded-full bg-muted-foreground/40" />
                      )}
                      <span>
                        <span className="font-semibold">
                          {rule.label.split(" — ")[0]} ({rule.method})
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {hint.ready
                            ? "ستُطبق على الأسطر غير المربوطة"
                            : "لن تُطبق — أعمدة القاعدة غير محددة في الجدولين"}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {runError ? <p className="text-sm text-destructive">{runError}</p> : null}
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
