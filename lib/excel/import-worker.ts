import { unlink } from "node:fs/promises";
import { ActivityAction, DataQualityIssueType, Prisma, UploadJobStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { uploadConfigSchema, type UploadConfig } from "@/lib/excel/config";
import { PRISMA_STANDARD_FIELDS } from "@/lib/excel/standard-fields";
import { documentRows } from "@/lib/excel/document-rows";
import { importRows } from "@/lib/excel/import-rows";
import { UnresolvableCellError } from "@/lib/excel/cell-value";
import type { StandardFieldKey } from "@/lib/excel/types";
import { columnSignature, workbookPath } from "@/lib/excel/workbook";
import { digitsOnly, normalizeStored } from "@/lib/normalization/arabic";
import { nationalIdColumns } from "@/lib/format/national-id";
import { nationalIdQualityIssue } from "@/lib/excel/national-id-quality";
import { normalizeShamCash, shamCashAsBigInt } from "@/lib/format/sham-cash";
import { assignColumnSortOrders } from "@/lib/categories/column-order";

const BATCH_SIZE = 1000;
type RowData = Record<string, string>;

function mappedValues(data: RowData, config: UploadConfig) {
  const values: Partial<Record<StandardFieldKey, string>> = {};
  for (const column of config.columns)
    if (column.standardField) values[column.standardField] = data[column.headerRaw] ?? "";
  if (
    !values.full_name &&
    [values.first_name, values.father_name, values.last_name].some(Boolean)
  ) {
    values.full_name = [values.first_name, values.father_name, values.last_name]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(" ");
  }
  return values;
}

export function recordInput(
  fileId: string,
  rowIndex: number,
  data: RowData,
  config: UploadConfig,
): Prisma.RecordCreateManyInput {
  const fields = mappedValues(data, config);
  const national = fields.national_id ?? "";
  const shamCash = fields.sham_cash ?? "";
  return {
    fileId,
    rowIndex,
    data,
    sfFirstName: fields.first_name ?? null,
    sfFatherName: fields.father_name ?? null,
    sfLastName: fields.last_name ?? null,
    sfFullName: fields.full_name ?? null,
    ...nationalIdColumns(national),
    sfShamCash: shamCashAsBigInt(shamCash),
    sfPersonalNo: fields.personal_no ?? null,
    sfMotherName: fields.mother_name ?? null,
    sfPhone: fields.phone ?? null,
    sfContractCode: fields.contract_code ?? null,
    sfSecondaryContractCode: fields.secondary_contract_code ?? null,
    nFirstName: fields.first_name ? normalizeStored(fields.first_name) : null,
    nFatherName: fields.father_name ? normalizeStored(fields.father_name) : null,
    nLastName: fields.last_name ? normalizeStored(fields.last_name) : null,
    nFullName: fields.full_name ? normalizeStored(fields.full_name) : null,
    nMotherName: fields.mother_name ? normalizeStored(fields.mother_name) : null,
    nContractCode: fields.contract_code ? normalizeStored(fields.contract_code) : null,
    nSecondaryContractCode: fields.secondary_contract_code
      ? normalizeStored(fields.secondary_contract_code)
      : null,
    dPersonalNo: fields.personal_no ? digitsOnly(fields.personal_no) : null,
    dPhone: fields.phone ? digitsOnly(fields.phone) : null,
  };
}

export function qualityIssues(
  fileId: string,
  rowIndex: number,
  data: RowData,
  config: UploadConfig,
  seenNationalIds: Set<string>,
) {
  const fields = mappedValues(data, config);
  const issues: Prisma.DataQualityIssueCreateManyInput[] = [];
  const nationalRaw = fields.national_id ?? "";
  const nationalIssue = nationalIdQualityIssue(nationalRaw, seenNationalIds);
  if (nationalIssue)
    issues.push({
      fileId,
      rowIndex,
      issueType: nationalIssue,
      columnName: "الرقم الوطني",
      rawValue: nationalRaw,
    });
  const phoneRaw = fields.phone ?? "";
  const phoneDigits = digitsOnly(phoneRaw);
  if (phoneRaw && (phoneDigits.length < 7 || phoneDigits.length > 15))
    issues.push({
      fileId,
      rowIndex,
      issueType: DataQualityIssueType.INVALID_PHONE,
      columnName: "رقم الهاتف",
      rawValue: phoneRaw,
    });
  const shamCashRaw = fields.sham_cash ?? "";
  if (shamCashRaw && normalizeShamCash(shamCashRaw) === null)
    issues.push({
      fileId,
      rowIndex,
      issueType: DataQualityIssueType.INVALID_SHAM_CASH,
      columnName: "الشام كاش",
      rawValue: shamCashRaw,
    });
  return issues;
}

async function flush(
  jobId: string,
  records: Prisma.RecordCreateManyInput[],
  issues: Prisma.DataQualityIssueCreateManyInput[],
  processedRows: number,
) {
  await prisma.$transaction(async (tx) => {
    if (records.length) await tx.record.createMany({ data: records });
    if (issues.length) await tx.dataQualityIssue.createMany({ data: issues });
    await tx.uploadJob.update({
      where: { id: jobId },
      data: { processedRows, status: UploadJobStatus.INSERTING },
    });
  });
}

export async function runImportJob(jobId: string) {
  const job = await prisma.uploadJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const parsed = uploadConfigSchema.safeParse(job.payload);
  if (!parsed.success) {
    await prisma.uploadJob.update({
      where: { id: jobId },
      data: {
        status: UploadJobStatus.FAILED,
        errorMessage: "إعدادات مهمة الرفع غير صالحة.",
        finishedAt: new Date(),
      },
    });
    return;
  }
  const config = parsed.data;
  try {
    await executeImport(jobId, config, "stream", false);
  } catch (error) {
    // The streaming reader can intermittently fail to resolve shared strings
    // (an ExcelJS streaming defect). Retry once through the document reader,
    // which resolves them natively; the partial file was already removed.
    // The retry marks the job FAILED itself when it fails, so its rejection
    // is swallowed to keep runImportJob rejection-free for setImmediate.
    if (error instanceof UnresolvableCellError) {
      await executeImport(jobId, config, "document", true).catch(() => undefined);
    }
  } finally {
    await unlink(workbookPath(config.token)).catch(() => undefined);
  }
}

async function executeImport(
  jobId: string,
  config: UploadConfig,
  source: "stream" | "document",
  isRetry: boolean,
) {
  let fileId: string | null = null;
  try {
    await prisma.uploadJob.update({
      where: { id: jobId },
      data: { status: UploadJobStatus.PARSING, startedAt: new Date(), errorMessage: null },
    });
    const created = await prisma.$transaction(async (tx) => {
      const file = await tx.file.create({
        data: {
          groupId: config.groupId,
          name: config.name,
          description: config.description,
          originalFilename: config.originalFilename,
          sheetName: config.sheetName,
          columnSignature: columnSignature(config.columns.map((column) => column.headerRaw)),
        },
      });
      const preparedColumns = config.columns.map((column) => ({
        ...column,
        prismaStandardField: column.standardField
          ? PRISMA_STANDARD_FIELDS[column.standardField]
          : null,
      }));
      const sortOrders = await assignColumnSortOrders(
        tx,
        preparedColumns.map((column) => ({
          categoryId: column.categoryId,
          standardField: column.prismaStandardField,
        })),
      );
      await tx.fileColumn.createMany({
        data: preparedColumns.map((column, index) => ({
          fileId: file.id,
          headerRaw: column.headerRaw,
          headerNormalized: column.headerNormalized,
          columnIndex: column.columnIndex,
          sortOrder: sortOrders[index],
          categoryId: column.categoryId,
          standardField: column.prismaStandardField,
        })),
      });
      await tx.uploadJob.update({ where: { id: jobId }, data: { fileId: file.id } });
      return file;
    });
    fileId = created.id;
    let processedRows = 0;
    let importedRows = 0;
    let recordBatch: Prisma.RecordCreateManyInput[] = [];
    let issueBatch: Prisma.DataQualityIssueCreateManyInput[] = [];
    const seenNationalIds = new Set<string>();
    const rows = source === "stream" ? importRows(config) : documentRows(config);
    for await (const row of rows) {
      processedRows += 1;
      const data: RowData = {};
      for (const column of config.columns)
        data[column.headerRaw] = row.values[column.columnIndex - 1] ?? "";
      if (Object.values(data).every((cell) => !cell.trim())) {
        issueBatch.push({
          fileId,
          rowIndex: row.rowIndex,
          issueType: DataQualityIssueType.EMPTY_ROW,
          columnName: null,
          rawValue: null,
        });
      } else {
        recordBatch.push(recordInput(fileId, row.rowIndex, data, config));
        issueBatch.push(...qualityIssues(fileId, row.rowIndex, data, config, seenNationalIds));
        importedRows += 1;
      }
      if (recordBatch.length + issueBatch.length >= BATCH_SIZE) {
        await flush(jobId, recordBatch, issueBatch, processedRows);
        recordBatch = [];
        issueBatch = [];
      }
    }
    await flush(jobId, recordBatch, issueBatch, processedRows);
    await prisma.$transaction([
      prisma.file.update({ where: { id: fileId }, data: { rowCount: importedRows } }),
      prisma.uploadJob.update({
        where: { id: jobId },
        data: {
          status: UploadJobStatus.DONE,
          totalRows: processedRows,
          processedRows,
          finishedAt: new Date(),
        },
      }),
      prisma.activityLog.create({
        data: {
          action: ActivityAction.FILE_UPLOADED,
          targetName: config.name,
          details: {
            fileId,
            rows: importedRows,
            sheetName: config.sheetName,
            ...(config.linkedSheets ? { linkedSheets: config.linkedSheets } : {}),
            ...(isRetry ? { fallback: "document" } : {}),
          },
        },
      }),
    ]);
  } catch (error) {
    if (fileId) await prisma.file.delete({ where: { id: fileId } }).catch(() => undefined);
    const message = error instanceof Error ? error.message : "فشل استيراد الملف لسبب غير متوقع.";
    await prisma.uploadJob.update({
      where: { id: jobId },
      data: {
        fileId: null,
        status: UploadJobStatus.FAILED,
        errorMessage: message,
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}
