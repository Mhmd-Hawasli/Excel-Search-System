import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db/prisma";
import { saveAndInspectWorkbook } from "@/lib/excel/workbook";
import { runImportJob } from "@/lib/excel/import-worker";
import { mergeFilePath, saveAndInspectMergeFile } from "@/lib/merge/storage";
import { createMergeSession } from "@/lib/merge/session";
import { exportMergeWorkbook } from "@/lib/merge/exporter";
import { parseUploadedWorkbook } from "@/lib/sheet-merge/workbook";
import { buildSheetMerge } from "@/lib/sheet-merge/merge";
import { exportSheetMergeWorkbook } from "@/lib/sheet-merge/exporter";

// Table-only import (no HTTP server needed): sheets carrying a real Excel
// Table import just the table — rows and columns outside it (plus any totals
// row) are ignored. Sheets without a table keep importing normally.

async function loadBuffer(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

function tableColumns(headers: string[]) {
  return headers.map((name) => ({ name }));
}

async function main() {
  const tag = randomUUID().slice(0, 8);

  // ---- 1. main archive import reads only the table -------------------------
  const main = new ExcelJS.Workbook();
  const sheet = main.addWorksheet("Sheet1");
  sheet.getCell("A1").value = "note: ignore me";
  sheet.getCell("A2").value = "junk";
  const tableHeaders = ["h1", "h2"];
  sheet.addTable({
    name: "DataTable",
    ref: "B2",
    headerRow: true,
    totalsRow: true,
    columns: [
      { name: "h1", totalsRowFunction: "none" },
      { name: "h2", totalsRowFunction: "sum" },
    ],
    rows: [
      ["t1", 10],
      ["t2", 20],
    ],
  });
  sheet.getCell("A9").value = "junk below";
  const inspection = await saveAndInspectWorkbook(
    Buffer.from(await main.xlsx.writeBuffer()),
    "tabled.xlsx",
  );
  assert.deepEqual(
    inspection.selected.columns.map((column) => column.headerRaw),
    tableHeaders,
  );
  assert.equal(inspection.selected.rowCount, 2);
  const group = await prisma.group.create({ data: { name: `اختبار الجداول ${tag}` } });
  try {
    const job = await prisma.uploadJob.create({
      data: {
        status: "PENDING",
        totalRows: 0,
        processedRows: 0,
        payload: {
          token: inspection.token,
          groupId: group.id,
          name: `tabled-${tag}`,
          description: "",
          originalFilename: "tabled.xlsx",
          sheetName: inspection.selected.sheetName,
          sheetIndex: 1,
          totalRows: 2,
          columns: tableHeaders.map((headerRaw, index) => ({
            headerRaw,
            headerNormalized: headerRaw,
            columnIndex: index + 1,
            standardField: null,
            categoryId: null,
          })),
        },
      },
    });
    await runImportJob(job.id);
    const finished = await prisma.uploadJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(finished.status, "DONE", finished.errorMessage ?? "");
    const records = await prisma.record.findMany({
      where: { fileId: finished.fileId! },
      orderBy: { rowIndex: "asc" },
    });
    assert.equal(records.length, 2);
    assert.deepEqual(
      records.map((record) => record.data),
      [
        { h1: "t1", h2: "10" },
        { h1: "t2", h2: "20" },
      ],
    );
    console.log("PASS: main import reads only the Excel Table (junk and totals ignored).");
  } finally {
    await prisma.group.delete({ where: { id: group.id } });
  }

  // ---- 2. merge files read only the table ----------------------------------
  async function mergeFile(fill: string) {
    const workbook = new ExcelJS.Workbook();
    const mergeSheet = workbook.addWorksheet("s");
    mergeSheet.getCell("A1").value = "junk";
    mergeSheet.addTable({
      name: "M",
      ref: "B1",
      headerRow: true,
      totalsRow: false,
      columns: tableColumns(["name", "id", "mother"]),
      rows: [["same person", "123456789", "mama"]],
    });
    mergeSheet.getCell("A9").value = fill;
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  const left = await saveAndInspectMergeFile(await mergeFile("junk left"), "left.xlsx");
  const right = await saveAndInspectMergeFile(await mergeFile("junk right"), "right.xlsx");
  try {
    assert.deepEqual(left.selected.headers, ["name", "id", "mother"]);
    assert.equal(left.selected.rowCount, 1);
    const { session } = await createMergeSession({
      left: { token: left.token, sheetName: "s", mapping: { fullName: 0, motherName: 2 } },
      right: { token: right.token, sheetName: "s", mapping: { fullName: 0, motherName: 2 } },
    });
    assert.equal(session.left.rows.length, 1);
    assert.deepEqual(session.left.rows[0].cells, ["same person", "123456789", "mama"]);
    const merged = await loadBuffer(
      await exportMergeWorkbook(
        { headers: session.left.headers, rows: session.left.rows },
        { headers: session.right.headers, rows: session.right.rows },
      ),
    );
    assert.equal(String(merged.worksheets[0].getCell("B2").value), "same person");
    console.log("PASS: merge-files import reads only the Excel Table.");
  } finally {
    await unlink(mergeFilePath(left.token)).catch(() => undefined);
    await unlink(mergeFilePath(right.token)).catch(() => undefined);
  }

  // ---- 3. sheet merge reads only the table ---------------------------------
  const multi = new ExcelJS.Workbook();
  const mainSheet = multi.addWorksheet("main");
  mainSheet.getCell("A1").value = "junk";
  mainSheet.addTable({
    name: "Main",
    ref: "B1",
    headerRow: true,
    totalsRow: false,
    columns: tableColumns(["name", "nationalId"]),
    rows: [["person", "123456789"]],
  });
  const extraSheet = multi.addWorksheet("extra");
  extraSheet.getCell("A1").value = "junk";
  extraSheet.addTable({
    name: "Extra",
    ref: "B1",
    headerRow: true,
    totalsRow: false,
    columns: tableColumns(["nationalId", "city"]),
    rows: [["123456789", "damascus"]],
  });
  const uploaded = await parseUploadedWorkbook(
    Buffer.from(await multi.xlsx.writeBuffer()),
    "multi.xlsx",
  );
  assert.deepEqual(uploaded.sheets[0].headers, ["name", "nationalId"]);
  assert.deepEqual(uploaded.sheets[0].rows.map((row) => row.cells), [["person", "123456789"]]);
  const built = buildSheetMerge(uploaded, { nationalIdColumn: 1, sheetNames: ["extra"] });
  const sheetMerged = await loadBuffer(await exportSheetMergeWorkbook(built));
  assert.equal(String(sheetMerged.worksheets[0].getCell("A2").value), "person");
  assert.equal(String(sheetMerged.worksheets[0].getCell("C2").value), "damascus");
  console.log("PASS: sheet-merge import reads only the Excel Table.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
