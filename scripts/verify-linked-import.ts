import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db/prisma";
import { getAdminCredentials } from "@/lib/auth/config";
import { ensureUniqueStandardFields } from "@/lib/excel/mapping";
import { workbookPath } from "@/lib/excel/workbook";
import type { SheetInspection, WorkbookInspection } from "@/lib/excel/types";

// Exercises the running local app using one uniquely named temporary group.
// Cleanup is restricted to this run's group, jobs, uploaded copies and activity names.
async function main() {
  const groupId = randomUUID();
  const name = `اختبار ربط الأوراق ${groupId}`;
  const tokens: string[] = [];
  const jobIds: string[] = [];
  const activityNames = new Set([name]);
  const initialCount = await prisma.record.count();
  const base = "http://localhost:3000";
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(getAdminCredentials()),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  async function upload(value = "مهندس", orphan = false) {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("الأساسية").addRows([
      ["الاسم الثلاثي", "الرقم الوطني", "اسم الأم"],
      ["اختبار أحمد سالم", "123456789", "اختبار مريم"],
      ["اختبار ليلى سالم", "9876543210", "اختبار فاطمة"],
    ]);
    workbook.addWorksheet("العمل").addRows([
      ["الرقم الوطني", "المسمى الوظيفي"],
      ["٠٩٨٧٦٥٤٣٢١٠", "محاسب"],
      [orphan ? "55566677788" : "٠٠١٢٣ ٤٥٦ ٧٨٩", value],
    ]);
    workbook.addWorksheet("التواصل").addRows([
      ["الرقم الوطني", "رقم الهاتف", "المسمى الوظيفي"],
      [123456789, "0937000000", "رئيس قسم"],
    ]);
    workbook.getWorksheet("العمل")!.getCell("A2").value = {
      formula: "الأساسية!B3",
      result: "٠٩٨٧٦٥٤٣٢١٠",
    };
    workbook.getWorksheet("التواصل")!.getCell("A2").value = {
      formula: "الأساسية!B2",
      result: 123456789,
    };
    const form = new FormData();
    form.set(
      "file",
      new Blob([new Uint8Array(await workbook.xlsx.writeBuffer())]),
      "linked-test.xlsx",
    );
    const response = await fetch(`${base}/api/workbooks/inspect`, {
      method: "POST",
      headers: { cookie },
      body: form,
    });
    assert.equal(response.status, 200);
    const inspection = (await response.json()) as WorkbookInspection;
    tokens.push(inspection.token);
    return inspection;
  }
  async function waitForJob(jobId: string) {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const job = await prisma.uploadJob.findUniqueOrThrow({ where: { id: jobId } });
      if (job.status === "DONE" || job.status === "FAILED") {
        // Replacement reuses the import job, briefly passing through DONE before swapping.
        await new Promise((resolve) => setTimeout(resolve, 300));
        const settled = await prisma.uploadJob.findUniqueOrThrow({ where: { id: jobId } });
        if (settled.status === "DONE" || settled.status === "FAILED") return settled;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("Timed out waiting for linked import");
  }
  async function startJob(path: string, config: unknown) {
    const response = await post(path, config);
    assert.equal(response.status, 202, await response.clone().text());
    const { jobId } = (await response.json()) as { jobId: string };
    jobIds.push(jobId);
    const job = await prisma.uploadJob.findUniqueOrThrow({ where: { id: jobId } });
    const payload = job.payload as { name: string };
    activityNames.add(payload.name);
    return waitForJob(jobId);
  }
  await prisma.group.create({ data: { id: groupId, name } });
  try {
    const inspection = await upload();
    const linkedSheets = { sheetNames: ["العمل", "التواصل"], nationalIdColumnIndex: 2 };
    const linked = await post("/api/workbooks/linked", { token: inspection.token, linkedSheets });
    assert.equal(linked.status, 200);
    const sheet = (await linked.json()) as SheetInspection;
    assert.equal(sheet.columnCount, 6);
    assert.equal(sheet.rowCount, 2);
    assert.equal(sheet.preview[0][3], "مهندس");
    const columns = ensureUniqueStandardFields(
      sheet.columns.map((column) => ({
        ...column,
        standardField: column.suggestedField,
        categoryId: null,
      })),
      2,
    );
    const config = {
      token: inspection.token,
      groupId,
      name,
      description: "",
      originalFilename: inspection.originalFilename,
      sheetName: sheet.sheetName,
      sheetIndex: 1,
      totalRows: sheet.rowCount,
      linkedSheets,
      columns,
    };
    const imported = await startJob("/api/upload-jobs", config);
    assert.equal(imported.status, "DONE", imported.errorMessage ?? "");
    const fileId = imported.fileId!;
    const records = await prisma.record.findMany({
      where: { fileId },
      orderBy: { rowIndex: "asc" },
    });
    assert.equal(records.length, 2);
    assert.equal(records[0].sfNationalId, 123456789n);
    assert.equal(records[0].sfPhone, "0937000000");
    assert.equal(
      (records[0].data as Record<string, string>)["المسمى الوظيفي [التواصل]"],
      "رئيس قسم",
    );
    assert.equal(await prisma.fileColumn.count({ where: { fileId } }), 6);
    const search = await fetch(
      `${base}/api/search?q=123456789&mode=custom&field=national_id&groupId=${groupId}`,
      { headers: { cookie } },
    );
    assert.equal(search.status, 200);
    assert.equal((await search.json()).rows[0].dNationalId, "00123456789");
    const detail = await fetch(`${base}/records/${records[0].id}`, { headers: { cookie } });
    assert.equal(detail.status, 200);
    assert((await detail.text()).includes("المسمى الوظيفي [التواصل]"));
    const jobConflicts = await fetch(
      `${base}/api/conflicts?category=conflicting&field=job_title&rule=person_job&pageSize=100`,
      { headers: { cookie } },
    );
    assert.equal(jobConflicts.status, 200);
    const conflictResult = await jobConflicts.json();
    assert(
      conflictResult.rows.some((row: { id: string }) => row.id === records[0].id),
      "qualified job title remains visible to conflict rules",
    );
    const replacement = await upload("مدير");
    const updated = await startJob(`/api/files/${fileId}/replace`, {
      ...config,
      token: replacement.token,
      mode: "same",
    });
    assert.equal(updated.status, "DONE", updated.errorMessage ?? "");
    const current = await prisma.record.findMany({
      where: { fileId },
      orderBy: { rowIndex: "asc" },
    });
    assert.equal((current[0].data as Record<string, string>)["المسمى الوظيفي"], "مدير");
    const malformed = await upload("خطأ", true);
    const rejected = await post("/api/workbooks/linked", { token: malformed.token, linkedSheets });
    assert.equal(rejected.status, 422);
    assert((await rejected.json()).error.includes("الصف 3"));
    const failed = await startJob(`/api/files/${fileId}/replace`, {
      ...config,
      token: malformed.token,
      mode: "same",
    });
    assert.equal(failed.status, "FAILED");
    assert.deepEqual(
      await prisma.record.findMany({ where: { fileId }, orderBy: { rowIndex: "asc" } }),
      current,
      "failed replacement preserves original records",
    );
    console.log(
      "PASS: multi-sheet preview, import, numeric joins, search, details, duplicate-title conflicts, replacement and failure preservation.",
    );
  } finally {
    for (const id of jobIds) await waitForJob(id);
    await prisma.$transaction(async (tx) => {
      await tx.uploadJob.deleteMany({ where: { id: { in: jobIds } } });
      await tx.group.delete({ where: { id: groupId } });
      await tx.activityLog.deleteMany({ where: { targetName: { in: [...activityNames] } } });
    });
    for (const token of tokens) await unlink(workbookPath(token)).catch(() => undefined);
    assert.equal(
      await prisma.record.count(),
      initialCount,
      "fixture cleanup preserves archive record count",
    );
    console.log(
      "Temporary linked-import group, jobs and files removed; archive record count unchanged.",
    );
  }
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
