import { ActivityAction, DataQualityIssueType, Prisma, StandardField, UploadJobStatus } from "@prisma/client";
import { z } from "zod";
import { CATEGORY_LIMIT_MESSAGE, MAX_CUSTOM_CATEGORIES } from "@/lib/categories/config";
import { digitsOnly } from "@/lib/normalization/arabic";

export const BACKUP_SCHEMA_VERSION = 1 as const;
const date = z.coerce.date();
const nullableText = z.string().nullable();
const nullableShamCash = z.string().nullable().transform((value, context) => {
  if (value === null) return null;
  const digits = digitsOnly(value);
  if (!digits || digits.length > 16) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "رقم شام كاش في النسخة الاحتياطية غير صالح." });
    return z.NEVER;
  }
  return BigInt(digits);
});
const jsonInput = z.unknown().transform((value, context) => {
  try { JSON.stringify(value); return value as Prisma.InputJsonValue; }
  catch { context.addIssue({ code: z.ZodIssueCode.custom, message: "قيمة JSON غير صالحة." }); return z.NEVER; }
});

const group = z.object({ id: z.string().uuid(), name: z.string(), description: z.string(), sortOrder: z.number().int(), createdAt: date, updatedAt: date });
const category = z.object({ id: z.string().uuid(), name: z.string(), sortOrder: z.number().int(), createdAt: date });
const file = z.object({ id: z.string().uuid(), groupId: z.string().uuid(), name: z.string(), description: z.string(), originalFilename: z.string(), sheetName: z.string(), rowCount: z.number().int(), columnSignature: z.string(), version: z.number().int(), uploadedAt: date, updatedAt: date });
const fileColumn = z.object({ id: z.string().uuid(), fileId: z.string().uuid(), headerRaw: z.string(), headerNormalized: z.string(), columnIndex: z.number().int(), sortOrder: z.number().int().nonnegative().optional(), categoryId: z.string().uuid().nullable(), standardField: z.nativeEnum(StandardField).nullable(), createdAt: date }).transform((column) => ({ ...column, sortOrder: column.sortOrder ?? column.columnIndex }));
const record = z.object({
  id: z.string().uuid(), fileId: z.string().uuid(), rowIndex: z.number().int(), data: jsonInput,
  sfFirstName: nullableText, sfFatherName: nullableText, sfLastName: nullableText, sfFullName: nullableText,
  sfNationalId: nullableText, sfShamCash: nullableShamCash, sfPersonalNo: nullableText, sfMotherName: nullableText,
  sfPhone: nullableText, sfContractCode: nullableText, sfSecondaryContractCode: nullableText.optional().default(null), nFirstName: nullableText, nFatherName: nullableText,
  nLastName: nullableText, nFullName: nullableText, nMotherName: nullableText, nContractCode: nullableText, nSecondaryContractCode: nullableText.optional().default(null),
  dNationalId: nullableText, dPersonalNo: nullableText, dPhone: nullableText,
  nationalIdNum: z.string().nullable().transform((value) => value === null ? null : BigInt(value)), createdAt: date,
});
const issue = z.object({ id: z.string().uuid(), fileId: z.string().uuid(), rowIndex: z.number().int(), issueType: z.nativeEnum(DataQualityIssueType), columnName: nullableText, rawValue: nullableText, createdAt: date });
const template = z.object({ id: z.string().uuid(), groupId: z.string().uuid(), name: z.string(), headerSignature: z.string(), mapping: jsonInput, createdAt: date, updatedAt: date });
const job = z.object({ id: z.string().uuid(), fileId: z.string().uuid().nullable(), status: z.nativeEnum(UploadJobStatus), totalRows: z.number().int(), processedRows: z.number().int(), errorMessage: nullableText, payload: jsonInput, startedAt: date.nullable(), finishedAt: date.nullable() });
const activity = z.object({ id: z.string().uuid(), action: z.nativeEnum(ActivityAction), targetName: z.string(), details: jsonInput, createdAt: date });

export const backupSchema = z.object({
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  exportedAt: z.string().datetime(),
  application: z.literal("excel-archive-search"),
  data: z.object({ groups: z.array(group), categories: z.array(category).max(MAX_CUSTOM_CATEGORIES, CATEGORY_LIMIT_MESSAGE), files: z.array(file), fileColumns: z.array(fileColumn), records: z.array(record), dataQualityIssues: z.array(issue), mappingTemplates: z.array(template), uploadJobs: z.array(job), activityLogs: z.array(activity) }),
});
