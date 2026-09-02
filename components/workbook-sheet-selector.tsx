"use client";

import { useId, useState } from "react";
import { Layers, LoaderCircle } from "lucide-react";
import type { SheetInspection, WorkbookInspection } from "@/lib/excel/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

export function WorkbookSheetSelector({
  inspection,
  sheet,
  onChange,
  busy,
  onBusyChange,
}: {
  inspection: WorkbookInspection;
  sheet: SheetInspection | null;
  onChange: (sheet: SheetInspection | null) => void;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const id = useId();
  const [mode, setMode] = useState(sheet?.linkedSheets ? "linked" : "single");
  const [nationalColumn, setNationalColumn] = useState(
    String(
      sheet?.linkedSheets?.nationalIdColumnIndex ??
        inspection.selected.columns.find((column) => column.suggestedField === "national_id")
          ?.columnIndex ??
        "",
    ),
  );
  const [additionalNames, setAdditionalNames] = useState(
    sheet?.linkedSheets?.sheetNames ?? inspection.sheets.slice(1).map((item) => item.name),
  );
  const [error, setError] = useState<string | null>(null);

  function invalidate() {
    onChange(null);
    setError(null);
  }
  async function selectSheet(sheetName: string) {
    invalidate();
    onBusyChange(true);
    try {
      const response = await fetch(
        mode === "linked" ? "/api/workbooks/linked" : "/api/workbooks/sheet",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            mode === "linked"
              ? {
                  token: inspection.token,
                  linkedSheets: {
                    sheetNames: additionalNames,
                    nationalIdColumnIndex: Number(nationalColumn),
                  },
                }
              : { token: inspection.token, sheetName },
          ),
        },
      );
      const result = (await response.json()) as SheetInspection & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "تعذر معاينة الأوراق.");
      onChange(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر الاتصال؛ حاول مجدداً.");
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${id}-mode`}>طريقة الاستيراد</Label>
        <select
          id={`${id}-mode`}
          className={selectClass}
          value={mode}
          disabled={busy}
          onChange={(event) => {
            const next = event.target.value;
            setMode(next);
            setError(null);
            onChange(next === "single" ? inspection.selected : null);
          }}
        >
          <option value="single">ورقة واحدة</option>
          <option value="linked" disabled={inspection.sheets.length < 2}>
            عدة أوراق مترابطة بالرقم الوطني
          </option>
        </select>
      </div>
      {mode === "single" ? (
        <div className="space-y-2">
          <Label htmlFor={`${id}-sheet`}>الورقة</Label>
          <select
            id={`${id}-sheet`}
            className={selectClass}
            value={sheet?.sheetName ?? ""}
            disabled={busy}
            onChange={(event) => void selectSheet(event.target.value)}
          >
            <option value="" disabled>
              اختر الورقة…
            </option>
            {inspection.sheets.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name} — {item.rowCount.toLocaleString("en-US")} صف
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
          <p className="text-sm">
            <strong>الورقة الأساسية: {inspection.selected.sheetName}</strong> — الورقة الأولى في
            المصنف.
          </p>
          <div className="space-y-2">
            <Label htmlFor={`${id}-national`}>عمود الرقم الوطني في الورقة الأساسية</Label>
            <select
              id={`${id}-national`}
              className={selectClass}
              value={nationalColumn}
              disabled={busy}
              onChange={(event) => {
                setNationalColumn(event.target.value);
                invalidate();
              }}
            >
              <option value="" disabled>
                اختر عمود الربط…
              </option>
              {inspection.selected.columns.map((column) => (
                <option key={column.columnIndex} value={column.columnIndex}>
                  {column.headerRaw}
                </option>
              ))}
            </select>
          </div>
          <fieldset disabled={busy} className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">الأوراق الإضافية</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {inspection.sheets.slice(1).map((item) => (
                <label
                  key={item.name}
                  className="flex cursor-pointer items-center gap-2 rounded-md border bg-background p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={additionalNames.includes(item.name)}
                    onChange={(event) => {
                      setAdditionalNames((current) =>
                        event.target.checked
                          ? [...current, item.name]
                          : current.filter((name) => name !== item.name),
                      );
                      invalidate();
                    }}
                  />
                  <span>
                    {item.name} — {item.rowCount.toLocaleString("en-US")} صف
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-xs leading-6 text-muted-foreground">
            اختر أي عدد من الأوراق. يجب أن يكون الرقم الوطني في العمود الأول من كل ورقة إضافية،
            وبقية الأعمدة للمعلومات المرتبطة. الربط بالقيمة الرقمية دون تأثير للفراغات وأصفار العرض.
            تكرار المفتاح أو وجود رقم بلا مقابل في الورقة الأساسية يمنع الدمج ويظهر موضع المشكلة.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !nationalColumn || additionalNames.length === 0}
            onClick={() => void selectSheet(inspection.selected.sheetName)}
          >
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Layers className="size-4" />
            )}
            معاينة وربط الأوراق
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {sheet ? (
        <div className="space-y-2 rounded-lg bg-muted p-4 text-sm" role="status">
          <p className="font-bold">
            تم اكتشاف {sheet.columnCount} عمود و{sheet.rowCount.toLocaleString("en-US")} صف بيانات.
          </p>
          {sheet.linkedSheets ? (
            <>
              <p>
                سيُستورد ملف واحد يجمع {sheet.linkedSheets.sheetNames.length + 1} أوراق، بسجل واحد
                لكل صف في الورقة الأساسية.
              </p>
              {sheet.linkedSummary?.map((item) => (
                <p key={item.sheetName} className="text-xs text-muted-foreground">
                  {item.sheetName}: رُبط {item.matchedRows.toLocaleString("en-US")} صف، و
                  {item.missingRows.toLocaleString("en-US")} سجل أساسي بلا معلومات إضافية من هذه
                  الورقة.
                </p>
              ))}
            </>
          ) : (
            <p className="text-muted-foreground">سيُستورد محتوى ورقة «{sheet.sheetName}» فقط.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
