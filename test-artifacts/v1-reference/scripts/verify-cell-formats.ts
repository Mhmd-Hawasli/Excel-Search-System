import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db/prisma";
import { saveAndInspectWorkbook } from "@/lib/excel/workbook";
import { runImportJob } from "@/lib/excel/import-worker";
import { buildFileExportWorkbook } from "@/lib/excel/file-export";
import { mergeFilePath, saveAndInspectMergeFile } from "@/lib/merge/storage";
import { createMergeSession } from "@/lib/merge/session";
import { exportMergeWorkbook } from "@/lib/merge/exporter";
import { parseUploadedWorkbook } from "@/lib/sheet-merge/workbook";
import { buildSheetMerge } from "@/lib/sheet-merge/merge";
import { exportSheetMergeWorkbook } from "@/lib/sheet-merge/exporter";

// End-to-end format round trip (no HTTP server needed):
// per-cell fills + font colors: styled workbook → inspect → import →
// database → export, plus the isolated merge-files and merge-sheets flows.
// Every export must also draw all cell borders. Temporary archive fixtures
// are removed afterwards; merge tmp files are deleted explicitly.

function solid(argb: string) {
  return { type: "pattern", pattern: "solid", fgColor: { argb } } as const;
}

function fillOf(cell: ExcelJS.Cell) {
  return (cell.fill as { fgColor?: { argb?: string } }).fgColor?.argb;
}

function fontOf(cell: ExcelJS.Cell) {
  return (cell.font as { color?: { argb?: string } } | undefined)?.color?.argb;
}

function bordersOf(cell: ExcelJS.Cell) {
  const border = (cell.border ?? {}) as Record<string, { style?: string } | undefined>;
  return [border.top?.style, border.left?.style, border.bottom?.style, border.right?.style];
}

function assertAllBorders(cell: ExcelJS.Cell, where: string) {
  assert.deepEqual(bordersOf(cell), ["thin", "thin", "thin", "thin"], `borders of ${where}`);
}

async function loadBuffer(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

async function styledMainFile() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.getCell("A1").value = "name";
  sheet.getCell("B1").value = "id";
  sheet.getCell("A2").value = "mixed row";
  sheet.getCell("B2").value = "1";
  // Per-cell fills: every cell keeps its own color (no row majority).
  sheet.getRow(2).getCell(1).fill = solid("FFFF0000");
  sheet.getRow(2).getCell(2).fill = solid("FF0000FF");
  sheet.getRow(2).getCell(2).font = { color: { argb: "FF00FF00" } };
  sheet.getCell("A3").value = "plain row";
  sheet.getCell("B3").value = "2";
  sheet.getCell("A4").value = "theme row";
  sheet.getCell("B4").value = "3";
  sheet.getRow(4).getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { theme: 4 },
  };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function main() {
  const tag = randomUUID().slice(0, 8);

  // ---- 1. main archive import keeps per-cell colors ------------------------
  const inspection = await saveAndInspectWorkbook(await styledMainFile(), "styled.xlsx");
  const group = await prisma.group.create({ data: { name: `اختبار التنسيقات ${tag}` } });
  try {
    const job = await prisma.uploadJob.create({
      data: {
        status: "PENDING",
        totalRows: 0,
        processedRows: 0,
        payload: {
          token: inspection.token,
          groupId: group.id,
          name: `styled-${tag}`,
          description: "",
          originalFilename: "styled.xlsx",
          sheetName: inspection.selected.sheetName,
          sheetIndex: 1,
          totalRows: 3,
          columns: [
            {
              headerRaw: "name",
              headerNormalized: "name",
              columnIndex: 1,
              standardField: null,
              categoryId: null,
            },
            {
              headerRaw: "id",
              headerNormalized: "id",
              columnIndex: 2,
              standardField: null,
              categoryId: null,
            },
          ],
        },
      },
    });
    await runImportJob(job.id);
    const finished = await prisma.uploadJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(finished.status, "DONE", finished.errorMessage ?? "");
    const fileId = finished.fileId!;
    const records = await prisma.record.findMany({
      where: { fileId },
      orderBy: { rowIndex: "asc" },
    });
    assert.equal(records.length, 3);
    assert.deepEqual(records[0].fmtFills, { name: "FFFF0000", id: "FF0000FF" });
    assert.deepEqual(records[0].fmtFontColors, { id: "FF00FF00" });
    assert.equal(records[1].fmtFills, null);
    assert.equal(records[1].fmtFontColors, null);
    // Theme fills resolve through real file I/O to accent1.
    assert.deepEqual(records[2].fmtFills, { name: "FF5B9BD5" });

    // ---- 2. main export reapplies the same colors + all borders ------------
    const buffer = await buildFileExportWorkbook({
      sheetName: "Sheet1",
      columns: ["name", "id"],
      records: records.map((record) => ({
        id: record.id,
        rowIndex: record.rowIndex,
        data: record.data,
        fmtFills:
          record.fmtFills && typeof record.fmtFills === "object"
            ? (record.fmtFills as Record<string, string>)
            : null,
        fmtFontColors:
          record.fmtFontColors && typeof record.fmtFontColors === "object"
            ? (record.fmtFontColors as Record<string, string>)
            : null,
      })),
      edits: [],
    });
    const exported = await loadBuffer(buffer);
    const sheet = exported.worksheets[0];
    assert.equal(String(sheet.getCell("A2").value), "mixed row");
    assert.equal(fillOf(sheet.getCell("A2")), "FFFF0000");
    assert.equal(fillOf(sheet.getCell("B2")), "FF0000FF");
    assert.equal(fontOf(sheet.getCell("B2")), "FF00FF00");
    assert.equal(fillOf(sheet.getCell("A3")), undefined);
    assert.equal(fillOf(sheet.getCell("A4")), "FF5B9BD5");
    assertAllBorders(sheet.getCell("A1"), "header A1");
    assertAllBorders(sheet.getCell("A2"), "data A2");
    assertAllBorders(sheet.getCell("B2"), "data B2");
    console.log("PASS: main import stores per-cell fills + fonts, export reapplies them with borders.");
  } finally {
    await prisma.group.delete({ where: { id: group.id } });
  }

  // ---- 3. merge files ------------------------------------------------------
  async function mergeFile(rows: Array<{ name: string; id: string; fill: string }>) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("s");
    sheet.getCell("A1").value = "name";
    sheet.getCell("B1").value = "id";
    sheet.getCell("C1").value = "mother";
    rows.forEach((row, index) => {
      sheet.getCell(`A${index + 2}`).value = row.name;
      sheet.getCell(`B${index + 2}`).value = row.id;
      sheet.getCell(`C${index + 2}`).value = "mama";
      sheet.getRow(index + 2).getCell(1).fill = solid(row.fill);
      sheet.getRow(index + 2).getCell(2).fill = solid(row.fill);
      sheet.getRow(index + 2).getCell(3).fill = solid(row.fill);
    });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  const left = await saveAndInspectMergeFile(
    await mergeFile([{ name: "same person", id: "123456789", fill: "FFFF0000" }]),
    "left.xlsx",
  );
  const right = await saveAndInspectMergeFile(
    await mergeFile([{ name: "same person", id: "123456789", fill: "FF00FF00" }]),
    "right.xlsx",
  );
  try {
    const { session } = await createMergeSession({
      left: { token: left.token, sheetName: "s", mapping: { fullName: 0, motherName: 2 } },
      right: { token: right.token, sheetName: "s", mapping: { fullName: 0, motherName: 2 } },
    });
    const merged = await loadBuffer(
      await exportMergeWorkbook(
        {
          headers: session.left.headers,
          rows: session.left.rows,
        },
        {
          headers: session.right.headers,
          rows: session.right.rows,
        },
      ),
    );
    const full = merged.worksheets[0];
    assert.equal(String(full.getCell("B2").value), "same person");
    // Each half keeps its own fill (no row majority).
    assert.equal(fillOf(full.getCell("B2")), "FFFF0000");
    assert.equal(fillOf(full.getCell("D2")), "FFFF0000");
    assert.equal(fillOf(full.getCell("E2")), "FF00FF00");
    assert.equal(fillOf(full.getCell("G2")), "FF00FF00");
    assertAllBorders(full.getCell("A1"), "merge header");
    assertAllBorders(full.getCell("B2"), "merge data");
    console.log("PASS: merge-files import keeps per-cell fills, export reapplies them with borders.");
  } finally {
    await unlink(mergeFilePath(left.token)).catch(() => undefined);
    await unlink(mergeFilePath(right.token)).catch(() => undefined);
  }

  // ---- 4. merge sheets within one file -------------------------------------
  const multi = new ExcelJS.Workbook();
  const main = multi.addWorksheet("main");
  main.getCell("A1").value = "name";
  main.getCell("B1").value = "nationalId";
  main.getCell("A2").value = "person";
  main.getCell("B2").value = "123456789";
  main.getRow(2).getCell(1).fill = solid("FFFF0000");
  main.getRow(2).getCell(2).fill = solid("FF0000FF");
  main.getRow(2).getCell(2).font = { color: { argb: "FF0000FF" } };
  const extra = multi.addWorksheet("extra");
  extra.getCell("A1").value = "nationalId";
  extra.getCell("B1").value = "city";
  extra.getCell("A2").value = "123456789";
  extra.getCell("B2").value = "damascus";
  extra.getRow(2).getCell(2).fill = solid("FF00FF00");
  const uploaded = await parseUploadedWorkbook(
    Buffer.from(await multi.xlsx.writeBuffer()),
    "multi.xlsx",
  );
  const built = buildSheetMerge(uploaded, { nationalIdColumn: 1, sheetNames: ["extra"] });
  const sheetMerged = await loadBuffer(await exportSheetMergeWorkbook(built));
  const grid = sheetMerged.worksheets[0];
  assert.equal(String(grid.getCell("A2").value), "person");
  assert.equal(fillOf(grid.getCell("A2")), "FFFF0000");
  assert.equal(fillOf(grid.getCell("B2")), "FF0000FF");
  assert.equal(fillOf(grid.getCell("C2")), "FF00FF00");
  assert.equal(fontOf(grid.getCell("B2")), "FF0000FF");
  assertAllBorders(grid.getCell("A2"), "sheet-merge data");
  console.log("PASS: sheet-merge import keeps per-cell fills + fonts, export reapplies them with borders.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
