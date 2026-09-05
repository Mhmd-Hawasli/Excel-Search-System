import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";
import { createStreamingWorkbookReader, isSelectedWorksheet } from "@/lib/excel/streaming";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("ExcelJS streaming workbook compatibility", () => {
  it("streams an ExcelJS-generated workbook whose workbook metadata is stored after its sheets", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "excel-archive-streaming-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "ordered-late-metadata.xlsx");
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("الأولى").addRows([["عنوان"], ["قيمة أولى"]]);
    workbook.addWorksheet("الثانية").addRows([["عنوان"], ["قيمة ثانية"]]);
    await workbook.xlsx.writeFile(filePath);

    const selectedRows: string[] = [];
    for await (const worksheet of createStreamingWorkbookReader(filePath)) {
      if (!isSelectedWorksheet(worksheet, "الثانية", 2)) continue;
      for await (const row of worksheet) selectedRows.push(row.getCell(1).text);
    }

    expect(selectedRows).toEqual(["عنوان", "قيمة ثانية"]);
  });
});
