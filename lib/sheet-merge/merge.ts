import {
  duplicateReason,
  missingInMainReason,
  nationalIdIssueReason,
  readNationalId,
} from "@/lib/sheet-merge/key";
import {
  UNLINKED_PREVIEW_LIMIT,
  type SheetMergeResult,
  type SheetMergeSheetStat,
  type UnlinkedRow,
  type UploadedSheetRow,
  type UploadedWorkbook,
} from "@/lib/sheet-merge/types";

/**
 * Pure merge engine of this section: plain arrays in, plain arrays out — no
 * database, no files, no session state, so it is fully unit-testable.
 *
 * قاعدة الربط:
 *  - الرقم الوطني في جميع الصفحات يُقرأ من الخلية ويُحوَّل إلى رقم، ويجب أن
 *    يكون أكثر من 7 محارف.
 *  - يجب ألا يتكرر الرقم الوطني داخل الصفحة الواحدة.
 *  - العمود الأول في كل صفحة إضافية هو الرقم الوطني الذي يربطها بالصفحة
 *    الرئيسية (الصفحة الأولى).
 *  - كل صف من الصفحة الأولى يبقى في التصدير، وتُلحق به أعمدة الصفحات
 *    الأخرى (بدون عمودها الأول) عند نجاح الربط.
 */

export type MergedGrid = { headers: string[]; rows: string[][] };

export type UnlinkedSheetRows = {
  sheetName: string;
  /** The sheet's own headers, unchanged. */
  headers: string[];
  rows: UnlinkedRow[];
};

export type BuiltSheetMerge = {
  stats: Omit<SheetMergeResult, "sessionId">;
  grid: MergedGrid;
  /** Sheets that have rows which could not be linked (for the export). */
  unlinkedSheets: UnlinkedSheetRows[];
};

export type SheetMergeProgress = (percent: number, detail: string | null) => void;

class UnlinkedCollector {
  readonly rows: UnlinkedRow[] = [];
  total = 0;

  add(row: UploadedSheetRow, value: string, reason: string) {
    this.total += 1;
    if (this.rows.length < UNLINKED_PREVIEW_LIMIT)
      this.rows.push({ rowNumber: row.rowNumber, value, reason, cells: row.cells });
  }

  get empty() {
    return this.total === 0;
  }
}

function percent(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function idCell(row: UploadedSheetRow, index: number) {
  return row.cells[index] ?? "";
}

export function resolveLinkedSheets(uploaded: UploadedWorkbook, sheetNames: string[]) {
  const selected = [...new Set(sheetNames.map((name) => name.trim()).filter(Boolean))];
  if (!selected.length) throw new Error("اختر صفحة واحدة على الأقل لدمجها مع الصفحة الأولى.");
  const linked = selected
    .map((name) => {
      const sheet = uploaded.sheets.find((entry) => entry.name === name);
      if (!sheet) throw new Error(`الصفحة «${name}» غير موجودة في المصنف.`);
      return sheet;
    })
    // The export order always follows the workbook order, whatever the
    // selection order was.
    .sort((a, b) => uploaded.sheets.indexOf(a) - uploaded.sheets.indexOf(b));
  for (const sheet of linked)
    if (sheet.headers.length < 2)
      throw new Error(
        `الصفحة «${sheet.name}»: يلزم الرقم الوطني في العمود الأول وعمود معلومات واحد على الأقل بعده.`,
      );
  return linked;
}

export function buildSheetMerge(
  uploaded: UploadedWorkbook,
  input: { nationalIdColumn: number; sheetNames: string[] },
  onProgress?: SheetMergeProgress,
): BuiltSheetMerge {
  const main = uploaded.sheets[0];
  if (!main) throw new Error("لا توجد صفحة رئيسية في المصنف.");
  const idColumn = input.nationalIdColumn;
  if (!Number.isInteger(idColumn) || idColumn < 0 || idColumn >= main.headers.length)
    throw new Error("اختر عمود الرقم الوطني من الصفحة الأولى.");

  const linked = resolveLinkedSheets(uploaded, input.sheetNames);

  // ---- الصفحة الرئيسية -------------------------------------------------
  onProgress?.(5, `قراءة الصفحة الرئيسية «${main.name}»…`);
  const headers = [...main.headers, ...linked.flatMap((sheet) => sheet.headers.slice(1))];
  const blankTail = new Array<string>(headers.length - main.headers.length).fill("");
  const gridRows = main.rows.map((row) => [...row.cells, ...blankTail]);
  const gridRowByKey = new Map<string, number>();
  const mainUnlinked = new UnlinkedCollector();
  let mainInvalid = 0;
  let mainDuplicates = 0;

  main.rows.forEach((row, gridIndex) => {
    const raw = idCell(row, idColumn);
    const { key, issue, digits } = readNationalId(raw);
    if (!key) {
      mainInvalid += 1;
      mainUnlinked.add(row, raw, nationalIdIssueReason(issue ?? "empty", digits));
      return;
    }
    const existing = gridRowByKey.get(key);
    if (existing !== undefined) {
      mainDuplicates += 1;
      mainUnlinked.add(row, raw, duplicateReason(main.rows[existing].rowNumber));
      return;
    }
    gridRowByKey.set(key, gridIndex);
  });

  // ---- الصفحات المرتبطة ------------------------------------------------
  const matchedMainRows = new Set<number>();
  const stats: SheetMergeSheetStat[] = [];
  const unlinkedSheets: UnlinkedSheetRows[] = [];
  let linkedOffset = main.headers.length;

  for (const [index, sheet] of linked.entries()) {
    onProgress?.(
      15 + Math.round(((index + 1) / linked.length) * 70),
      `ربط الصفحة «${sheet.name}» (${index + 1} من ${linked.length})…`,
    );
    const collector = new UnlinkedCollector();
    const rowByKey = new Map<string, UploadedSheetRow>();
    let invalid = 0;
    let duplicates = 0;
    let missing = 0;
    let joined = 0;

    for (const row of sheet.rows) {
      const raw = idCell(row, 0);
      const { key, issue, digits } = readNationalId(raw);
      if (!key) {
        invalid += 1;
        collector.add(row, raw, nationalIdIssueReason(issue ?? "empty", digits));
        continue;
      }
      const previous = rowByKey.get(key);
      if (previous) {
        duplicates += 1;
        collector.add(row, raw, duplicateReason(previous.rowNumber));
        continue;
      }
      rowByKey.set(key, row);
      const target = gridRowByKey.get(key);
      if (target === undefined) {
        missing += 1;
        collector.add(row, raw, missingInMainReason(main.name));
        continue;
      }
      row.cells
        .slice(1)
        .forEach((value, columnIndex) => (gridRows[target][linkedOffset + columnIndex] = value));
      matchedMainRows.add(target);
      joined += 1;
    }

    stats.push({
      sheetName: sheet.name,
      role: "linked",
      headers: sheet.headers.slice(1),
      unlinkedHeaders: sheet.headers,
      rowCount: sheet.rows.length,
      linkedCount: joined,
      percent: percent(joined, sheet.rows.length),
      validKeyCount: rowByKey.size,
      invalidCount: invalid,
      duplicateCount: duplicates,
      missingCount: missing,
      unlinkedTotal: collector.total,
      unlinked: collector.rows,
    });
    if (!collector.empty)
      unlinkedSheets.push({ sheetName: sheet.name, headers: sheet.headers, rows: collector.rows });
    linkedOffset += sheet.headers.length - 1;
  }

  onProgress?.(92, "احتساب نسب الربط…");
  const totalLinkedRows = stats.reduce((sum, sheet) => sum + sheet.linkedCount, 0);
  const totalRows = stats.reduce((sum, sheet) => sum + sheet.rowCount, 0);
  const mainStat: SheetMergeSheetStat = {
    sheetName: main.name,
    role: "main",
    headers: main.headers,
    unlinkedHeaders: main.headers,
    rowCount: main.rows.length,
    linkedCount: matchedMainRows.size,
    percent: percent(matchedMainRows.size, main.rows.length),
    validKeyCount: gridRowByKey.size,
    invalidCount: mainInvalid,
    duplicateCount: mainDuplicates,
    missingCount: 0,
    unlinkedTotal: mainUnlinked.total,
    unlinked: mainUnlinked.rows,
  };
  if (!mainUnlinked.empty)
    unlinkedSheets.unshift({
      sheetName: main.name,
      headers: main.headers,
      rows: mainUnlinked.rows,
    });
  onProgress?.(98, "تجهيز النتائج…");

  return {
    stats: {
      originalFilename: uploaded.originalFilename,
      mainSheetName: main.name,
      nationalIdColumn: idColumn,
      nationalIdHeader: main.headers[idColumn],
      exportHeaders: headers,
      exportRowCount: gridRows.length,
      linkPercent: percent(totalLinkedRows, totalRows),
      sheets: [mainStat, ...stats],
    },
    grid: { headers, rows: gridRows },
    unlinkedSheets,
  };
}
