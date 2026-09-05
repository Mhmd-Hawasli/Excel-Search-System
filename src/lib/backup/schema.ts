import { randomUUID } from "node:crypto";
import {
  ActivityAction,
  DataQualityIssueType,
  Prisma,
  StandardField,
  UploadJobStatus,
} from "@/generated/prisma/client";
import { z } from "zod";
import { CATEGORY_LIMIT_MESSAGE, MAX_CUSTOM_CATEGORIES } from "@/lib/categories/config";
import { digitsOnly, normalizeStored } from "@/lib/normalization/arabic";
import { nationalIdColumns } from "@/lib/format/national-id";
import { nationalIdQualityIssue } from "@/lib/excel/national-id-quality";
import { parseFunctionalCategory } from "@/lib/format/functional-category";

export const BACKUP_SCHEMA_VERSION = 1 as const;
const date = z.coerce.date();
const nullableText = z.string().nullable();
const nullableShamCash = z
  .string()
  .nullable()
  .transform((value, context) => {
    if (value === null) return null;
    const digits = digitsOnly(value);
    if (!digits || digits.length > 16) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "رقم شام كاش في النسخة الاحتياطية غير صالح.",
      });
      return z.NEVER;
    }
    return BigInt(digits);
  });
const jsonInput = z.unknown().transform((value, context) => {
  try {
    JSON.stringify(value);
    return value as Prisma.InputJsonValue;
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "قيمة JSON غير صالحة." });
    return z.NEVER;
  }
});

const group = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  sortOrder: z.number().int(),
  createdAt: date,
  updatedAt: date,
});
const category = z.object({
  id: z.string().uuid(),
  name: z.string(),
  sortOrder: z.number().int(),
  createdAt: date,
});
const file = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  originalFilename: z.string(),
  sheetName: z.string(),
  rowCount: z.number().int(),
  columnSignature: z.string(),
  version: z.number().int(),
  uploadedAt: date,
  updatedAt: date,
});
const fileColumn = z
  .object({
    id: z.string().uuid(),
    fileId: z.string().uuid(),
    headerRaw: z.string(),
    headerNormalized: z.string(),
    columnIndex: z.number().int(),
    sortOrder: z.number().int().nonnegative().optional(),
    categoryId: z.string().uuid().nullable(),
    standardField: z.nativeEnum(StandardField).nullable(),
    createdAt: date,
  })
  .transform((column) => ({ ...column, sortOrder: column.sortOrder ?? column.columnIndex }));
const record = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid(),
  rowIndex: z.number().int(),
  data: jsonInput,
  sfFirstName: nullableText,
  sfFatherName: nullableText,
  sfLastName: nullableText,
  sfFullName: nullableText,
  sfNationalId: nullableText,
  sfShamCash: nullableShamCash,
  sfPersonalNo: nullableText,
  sfMotherName: nullableText,
  sfPhone: nullableText,
  sfContractCode: nullableText,
  sfSecondaryContractCode: nullableText.optional().default(null),
  sfJobTitle: nullableText.optional().default(null),
  sfFunctionalCategory: z.number().int().min(0).max(5).nullable().optional().default(null),
  sfOrganizationalLevel: nullableText.optional().default(null),
  nFirstName: nullableText,
  nFatherName: nullableText,
  nLastName: nullableText,
  nFullName: nullableText,
  nMotherName: nullableText,
  nContractCode: nullableText,
  nSecondaryContractCode: nullableText.optional().default(null),
  nJobTitle: nullableText.optional().default(null),
  nOrganizationalLevel: nullableText.optional().default(null),
  dNationalId: nullableText,
  dPersonalNo: nullableText,
  dPhone: nullableText,
  nationalIdNum: nullableText,
  createdAt: date,
});
const issue = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid(),
  rowIndex: z.number().int(),
  issueType: z.nativeEnum(DataQualityIssueType),
  columnName: nullableText,
  rawValue: nullableText,
  createdAt: date,
});
const template = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  name: z.string(),
  headerSignature: z.string(),
  mapping: jsonInput,
  createdAt: date,
  updatedAt: date,
});
const job = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid().nullable(),
  status: z.nativeEnum(UploadJobStatus),
  totalRows: z.number().int(),
  processedRows: z.number().int(),
  errorMessage: nullableText,
  payload: jsonInput,
  startedAt: date.nullable(),
  finishedAt: date.nullable(),
});
const activity = z.object({
  id: z.string().uuid(),
  action: z.nativeEnum(ActivityAction),
  targetName: z.string(),
  details: jsonInput,
  createdAt: date,
});
const recordEdit = z.object({
  id: z.string().uuid(),
  recordId: z.string().uuid(),
  fileId: z.string().uuid(),
  fileColumnId: z.string().uuid().nullable(),
  headerRaw: z.string(),
  oldValue: z.string(),
  newValue: z.string(),
  createdAt: date,
});

export const backupSchema = z
  .object({
    schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
    exportedAt: z.string().datetime(),
    application: z.literal("excel-archive-search"),
    data: z.object({
      groups: z.array(group),
      categories: z.array(category).max(MAX_CUSTOM_CATEGORIES, CATEGORY_LIMIT_MESSAGE),
      files: z.array(file),
      fileColumns: z.array(fileColumn),
      records: z.array(record),
      dataQualityIssues: z.array(issue),
      mappingTemplates: z.array(template),
      uploadJobs: z.array(job),
      activityLogs: z.array(activity),
      recordEdits: z.array(recordEdit).optional().default([]),
    }),
  })
  .transform((backup) => {
    // Version 1 backups keep bigint values as JSON strings. Recompute national-ID
    // columns and quality from originals, including backups predating numeric storage.
    const headers = new Map(
      backup.data.fileColumns
        .filter((column) => column.standardField === StandardField.NATIONAL_ID)
        .map((column) => [column.fileId, column.headerRaw]),
    );
    const jobTitleHeaders = new Map(
      backup.data.fileColumns
        .filter((column) => column.standardField === StandardField.JOB_TITLE)
        .map((column) => [column.fileId, column.headerRaw]),
    );
    const functionalCategoryHeaders = new Map(
      backup.data.fileColumns
        .filter((column) => column.standardField === StandardField.FUNCTIONAL_CATEGORY)
        .map((column) => [column.fileId, column.headerRaw]),
    );
    const organizationalLevelHeaders = new Map(
      backup.data.fileColumns
        .filter((column) => column.standardField === StandardField.ORGANIZATIONAL_LEVEL)
        .map((column) => [column.fileId, column.headerRaw]),
    );
    const nationalIssueTypes: DataQualityIssueType[] = [
      DataQualityIssueType.MISSING_NATIONAL_ID,
      DataQualityIssueType.INVALID_NATIONAL_ID,
      DataQualityIssueType.DUPLICATE_NATIONAL_ID,
    ];
    const dataQualityIssues = backup.data.dataQualityIssues.filter(
      (entry) => !nationalIssueTypes.includes(entry.issueType),
    );
    const seenByFile = new Map<string, Set<string>>();
    const records = [...backup.data.records]
      .sort((a, b) => a.rowIndex - b.rowIndex)
      .map((entry) => {
        const originalData = entry.data;
        const data: Record<string, Prisma.InputJsonValue | null | undefined> =
          originalData && typeof originalData === "object" && !Array.isArray(originalData)
            ? { ...(originalData as Prisma.InputJsonObject) }
            : { __original_data: originalData };
        const header = headers.get(entry.fileId);
        const hasMappedValue = header !== undefined && Object.hasOwn(data, header);
        const raw = hasMappedValue
          ? data[header!]
          : (data.__national_id_original ?? entry.sfNationalId);
        if (!hasMappedValue && raw != null) data.__national_id_original = raw;
        const readHeader = (header: string | undefined) =>
          header !== undefined && Object.hasOwn(data, header) ? data[header] : undefined;
        const jobTitleRaw = readHeader(jobTitleHeaders.get(entry.fileId));
        const categoryRaw = readHeader(functionalCategoryHeaders.get(entry.fileId));
        const orgLevelRaw = readHeader(organizationalLevelHeaders.get(entry.fileId));
        const seen = seenByFile.get(entry.fileId) ?? new Set<string>();
        seenByFile.set(entry.fileId, seen);
        const issueType = nationalIdQualityIssue(raw, seen);
        if (issueType)
          dataQualityIssues.push({
            id: randomUUID(),
            fileId: entry.fileId,
            rowIndex: entry.rowIndex,
            issueType,
            columnName: "الرقم الوطني",
            rawValue: raw == null ? "" : String(raw),
            createdAt: entry.createdAt,
          });
        const jobTitle =
          jobTitleRaw !== undefined ? String(jobTitleRaw) : entry.sfJobTitle ?? null;
        const orgLevel =
          orgLevelRaw !== undefined ? String(orgLevelRaw) : entry.sfOrganizationalLevel ?? null;
        return {
          ...entry,
          data,
          ...nationalIdColumns(raw),
          sfJobTitle: jobTitle,
          sfFunctionalCategory:
            categoryRaw !== undefined ? parseFunctionalCategory(categoryRaw) : entry.sfFunctionalCategory,
          sfOrganizationalLevel: orgLevel,
          nJobTitle: jobTitle ? normalizeStored(jobTitle) : entry.nJobTitle ?? null,
          nOrganizationalLevel: orgLevel
            ? normalizeStored(orgLevel)
            : entry.nOrganizationalLevel ?? null,
        };
      });
    return { ...backup, data: { ...backup.data, records, dataQualityIssues } };
  });
