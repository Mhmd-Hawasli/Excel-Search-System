import ExcelJS from "exceljs";

/**
 * Thrown when a cell holds a structured value the reader cannot resolve to
 * text (e.g. an unresolvable shared-string reference from the streaming
 * reader). Retrying the same file through the document reader resolves these,
 * so the import worker catches this specific error and falls back instead of
 * archiving "[object Object]".
 */
export class UnresolvableCellError extends Error {
  constructor(sheet: string, address: string) {
    super(
      `الورقة «${sheet}»، الخلية ${address}: تعذر قراءة قيمة الخلية (نوع غير مدعوم). أعد حفظ المصنف في Excel بصيغة .xlsx ثم أعد الرفع.`,
    );
    this.name = "UnresolvableCellError";
  }
}

function cellLocation(cell: ExcelJS.Cell): { sheet: string; address: string } {
  let address = "غير معروف";
  let sheet = "غير معروف";
  try {
    address = cell.address ?? address;
    sheet = cell.worksheet?.name ?? sheet;
  } catch {
    // Keep the generic location labels when the cell carries no address.
  }
  return { sheet, address };
}

/** Read the saved value of a formula, never its expression or an external link. */
export function cellValueText(
  cell: ExcelJS.Cell,
  options?: { onUncachedFormula?: "throw" | "empty" },
): string {
  if (cell.type !== ExcelJS.ValueType.Formula) {
    const raw: unknown = (cell as unknown as { value?: unknown }).value;
    // Normal scalars (and null/undefined) keep the historical behavior.
    if (raw === null || raw === undefined) return "";
    if (typeof raw === "string") return raw;
    if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
    if (raw instanceof Date) return cell.text ?? "";
    if (typeof raw === "object") {
      const record = raw as Record<string, unknown>;
      // Rich-text runs: join their visible text.
      if (Array.isArray(record.richText)) {
        return record.richText
          .map((part) =>
            typeof part === "string" ? part : String((part as { text?: unknown }).text ?? ""),
          )
          .join("");
      }
      // Hyperlink value: keep the visible text, never the URL.
      if (typeof record.text === "string" && "hyperlink" in record) return record.text;
      // Error value: surface the code (e.g. #DIV/0!) instead of "[object Object]".
      if ("error" in record) return String(record.error);
      // Unresolved shared string (streaming reader cache miss) or any other
      // structured value: fail loudly with the cell address so the import job
      // can retry through the document reader instead of archiving
      // "[object Object]".
      const { sheet, address } = cellLocation(cell);
      throw new UnresolvableCellError(sheet, address);
    }
    return cell.text ?? "";
  }
  const result = cell.result;
  if (result === undefined || result === null) {
    // Merge flows treat a formula without a saved result as an empty cell
    // (rows left fully empty are skipped downstream); every other flow keeps
    // failing loudly so the user recalculates and re-saves the workbook.
    if (options?.onUncachedFormula === "empty") return "";
    throw new Error(
      `الورقة «${cell.worksheet.name}»، الخلية ${cell.address}: لا توجد نتيجة محفوظة للمعادلة. أعد حساب المصنف في Excel واحفظه ثم أعد فحص الملف.`,
    );
  }
  if (typeof result === "object" && "error" in result) return String(result.error);
  // ExcelJS Cell.text loses zero and false formula results because it tests truthiness.
  return String(result);
}
