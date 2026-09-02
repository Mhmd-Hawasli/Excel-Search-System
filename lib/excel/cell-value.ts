import ExcelJS from "exceljs";

/** Read the saved value of a formula, never its expression or an external link. */
export function cellValueText(cell: ExcelJS.Cell): string {
  if (cell.type !== ExcelJS.ValueType.Formula) return cell.text ?? "";
  const result = cell.result;
  if (result === undefined || result === null)
    throw new Error(
      `الورقة «${cell.worksheet.name}»، الخلية ${cell.address}: لا توجد نتيجة محفوظة للمعادلة. أعد حساب المصنف في Excel واحفظه ثم أعد فحص الملف.`,
    );
  if (typeof result === "object" && "error" in result) return String(result.error);
  // ExcelJS Cell.text loses zero and false formula results because it tests truthiness.
  return String(result);
}
