import { ActivityAction, DataQualityIssueType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { PRISMA_STANDARD_FIELDS } from "@/lib/excel/standard-fields";
import type { StandardFieldKey } from "@/lib/excel/types";
import { assignColumnSortOrders } from "@/lib/categories/column-order";
import { digitsOnly, normalizeStored } from "@/lib/normalization/arabic";
import { nationalIdColumns } from "@/lib/format/national-id";
import { nationalIdQualityIssue } from "@/lib/excel/national-id-quality";
import { normalizeShamCash, shamCashAsBigInt } from "@/lib/format/sham-cash";
import { parseFunctionalCategory } from "@/lib/format/functional-category";

type PatchColumn = {
  id: string;
  standardField: StandardFieldKey | null;
  categoryId: string | null;
};

type MappedColumn = {
  headerRaw: string;
  headerNormalized: string;
  columnIndex: number;
  standardField: StandardFieldKey | null;
  categoryId: string | null;
};

function mappedValues(data: Record<string, string>, mappedColumns: MappedColumn[]) {
  const values: Partial<Record<StandardFieldKey, string>> = {};
  for (const column of mappedColumns) {
    if (column.standardField) values[column.standardField] = data[column.headerRaw] ?? "";
  }
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

function qualityIssuesForRow(
  fileId: string,
  rowIndex: number,
  data: Record<string, string>,
  mappedColumns: MappedColumn[],
  seenNationalIds: Set<string>,
): Prisma.DataQualityIssueCreateManyInput[] {
  const fields = mappedValues(data, mappedColumns);
  const issues: Prisma.DataQualityIssueCreateManyInput[] = [];
  const nationalRaw = fields.national_id ?? "";
  const nationalIssue = nationalIdQualityIssue(nationalRaw, seenNationalIds);
  if (nationalIssue) {
    issues.push({
      fileId,
      rowIndex,
      issueType: nationalIssue,
      columnName: "الرقم الوطني",
      rawValue: nationalRaw,
    });
  }
  const phoneRaw = fields.phone ?? "";
  const phoneDigits = digitsOnly(phoneRaw);
  if (phoneRaw && (phoneDigits.length < 7 || phoneDigits.length > 15)) {
    issues.push({
      fileId,
      rowIndex,
      issueType: DataQualityIssueType.INVALID_PHONE,
      columnName: "رقم الهاتف",
      rawValue: phoneRaw,
    });
  }
  const shamCashRaw = fields.sham_cash ?? "";
  if (shamCashRaw && normalizeShamCash(shamCashRaw) === null) {
    issues.push({
      fileId,
      rowIndex,
      issueType: DataQualityIssueType.INVALID_SHAM_CASH,
      columnName: "الشام كاش",
      rawValue: shamCashRaw,
    });
  }
  const categoryRaw = fields.functional_category ?? "";
  if (categoryRaw && parseFunctionalCategory(categoryRaw) === 0) {
    issues.push({
      fileId,
      rowIndex,
      issueType: DataQualityIssueType.INVALID_FUNCTIONAL_CATEGORY,
      columnName: "الفئة الوظيفية",
      rawValue: categoryRaw,
    });
  }
  return issues;
}

export async function updateFileMappingAndRecompute(
  fileId: string,
  patches: PatchColumn[],
) {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: { columns: { orderBy: { columnIndex: "asc" } } },
  });
  if (!file) throw new Error("الملف غير موجود.");

  if (patches.length !== file.columns.length) {
    throw new Error("عدد الأعمدة المرسلة لا يطابق عدد أعمدة الملف.");
  }

  const existingById = new Map(file.columns.map((c) => [c.id, c]));
  for (const patch of patches) {
    if (!existingById.has(patch.id)) throw new Error("أحد الأعمدة لا ينتمي لهذا الملف.");
  }

  // Validate duplicate standardField
  const seen = new Set<StandardFieldKey>();
  for (const patch of patches) {
    if (!patch.standardField) continue;
    if (seen.has(patch.standardField)) {
      throw new Error("لا يمكن ربط حقل قياسي واحد بأكثر من عمود.");
    }
    seen.add(patch.standardField);
  }

  // Validate categories exist
  const categoryIds = [...new Set(patches.map((p) => p.categoryId).filter((v): v is string => Boolean(v)))];
  if (categoryIds.length > 0) {
    const count = await prisma.category.count({ where: { id: { in: categoryIds } } });
    if (count !== categoryIds.length) throw new Error("إحدى الفئات غير موجودة.");
  }

  // Build ordered patches matching existing column order (by columnIndex)
  const orderedPatches = file.columns.map((col) => patches.find((p) => p.id === col.id)!);

  // Build mappedColumns for recompute (header info from existing + new mapping)
  const mappedColumns: MappedColumn[] = file.columns.map((col) => {
    const patch = patches.find((p) => p.id === col.id)!;
    return {
      headerRaw: col.headerRaw,
      headerNormalized: col.headerNormalized,
      columnIndex: col.columnIndex,
      standardField: patch.standardField,
      categoryId: patch.categoryId,
    };
  });

  // Step 1: Update FileColumn rows with correct sortOrder
  await prisma.$transaction(async (tx) => {
    const placements = orderedPatches.map((patch) => ({
      categoryId: patch.categoryId,
      standardField: patch.standardField ? PRISMA_STANDARD_FIELDS[patch.standardField] : null,
    }));
    const sortOrders = await assignColumnSortOrders(tx, placements);

    // Update each column in order of existing columns
    for (let i = 0; i < file.columns.length; i++) {
      const col = file.columns[i];
      const patch = orderedPatches[i];
      const sortOrder = sortOrders[i];
      await tx.fileColumn.update({
        where: { id: col.id },
        data: {
          standardField: patch.standardField ? PRISMA_STANDARD_FIELDS[patch.standardField] : null,
          categoryId: patch.categoryId,
          sortOrder,
        },
      });
    }
  });

  // Step 2: Recompute records + quality issues
  // Delete old non-empty quality issues
  await prisma.dataQualityIssue.deleteMany({
    where: { fileId, issueType: { not: DataQualityIssueType.EMPTY_ROW } },
  });

  const BATCH = 500;
  const seenNationalIds = new Set<string>();
  let cursor: string | undefined = undefined;
  let totalUpdated = 0;

  while (true) {
    const findArgs: Prisma.RecordFindManyArgs = {
      where: { fileId },
      orderBy: { rowIndex: "asc" },
      take: BATCH,
      select: { id: true, rowIndex: true, data: true },
    };
    if (cursor) {
      findArgs.cursor = { id: cursor };
      findArgs.skip = 1;
    }
    const records = await prisma.record.findMany(findArgs);
    if (records.length === 0) break;

    const updates: Prisma.PrismaPromise<unknown>[] = [];
    const issues: Prisma.DataQualityIssueCreateManyInput[] = [];

    for (const rec of records) {
      const data = rec.data as Record<string, string>;
      const fields = mappedValues(data, mappedColumns);
      const national = fields.national_id ?? "";
      const shamCash = fields.sham_cash ?? "";

      const nationalCols = nationalIdColumns(national);

      updates.push(
        prisma.record.update({
          where: { id: rec.id },
          data: {
            sfFirstName: fields.first_name ?? null,
            sfFatherName: fields.father_name ?? null,
            sfLastName: fields.last_name ?? null,
            sfFullName: fields.full_name ?? null,
            sfNationalId: nationalCols.sfNationalId,
            dNationalId: nationalCols.dNationalId,
            nationalIdNum: nationalCols.nationalIdNum,
            sfShamCash: shamCashAsBigInt(shamCash),
            sfPersonalNo: fields.personal_no ?? null,
            sfMotherName: fields.mother_name ?? null,
            sfPhone: fields.phone ?? null,
            sfContractCode: fields.contract_code ?? null,
            sfSecondaryContractCode: fields.secondary_contract_code ?? null,
            sfJobTitle: fields.job_title ?? null,
            sfFunctionalCategory: parseFunctionalCategory(fields.functional_category ?? ""),
            sfOrganizationalLevel: fields.organizational_level ?? null,
            nFirstName: fields.first_name ? normalizeStored(fields.first_name) : null,
            nFatherName: fields.father_name ? normalizeStored(fields.father_name) : null,
            nLastName: fields.last_name ? normalizeStored(fields.last_name) : null,
            nFullName: fields.full_name ? normalizeStored(fields.full_name) : null,
            nMotherName: fields.mother_name ? normalizeStored(fields.mother_name) : null,
            nContractCode: fields.contract_code ? normalizeStored(fields.contract_code) : null,
            nSecondaryContractCode: fields.secondary_contract_code
              ? normalizeStored(fields.secondary_contract_code)
              : null,
            nJobTitle: fields.job_title ? normalizeStored(fields.job_title) : null,
            nOrganizationalLevel: fields.organizational_level
              ? normalizeStored(fields.organizational_level)
              : null,
            dPersonalNo: fields.personal_no ? digitsOnly(fields.personal_no) : null,
            dPhone: fields.phone ? digitsOnly(fields.phone) : null,
          },
        }),
      );

      issues.push(...qualityIssuesForRow(fileId, rec.rowIndex, data, mappedColumns, seenNationalIds));
    }

    // Execute record updates and issue inserts in parallel but within ordering
    // Do updates first
    await prisma.$transaction(updates);
    if (issues.length) {
      await prisma.dataQualityIssue.createMany({ data: issues });
    }

    totalUpdated += records.length;
    cursor = records[records.length - 1].id;
    if (records.length < BATCH) break;
  }

  await prisma.activityLog.create({
    data: {
      action: ActivityAction.FILE_UPDATED,
      targetName: file.name,
      details: { fileId, mappingUpdated: true, columns: patches.length, recordsUpdated: totalUpdated },
    },
  });

  return { updatedRecords: totalUpdated };
}
