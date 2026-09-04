import { ActivityAction, DataQualityIssueType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { StandardFieldKey } from "@/lib/excel/types";
import { digitsOnly, nationalIdDigits, normalizeStored } from "@/lib/normalization/arabic";
import { nationalIdColumns, nationalIdIssue } from "@/lib/format/national-id";
import { normalizeShamCash, shamCashAsBigInt } from "@/lib/format/sham-cash";

type MappedColumn = {
  headerRaw: string;
  standardField: StandardFieldKey | null;
};

function rowData(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "string" ? item : item == null ? "" : String(item),
    ]),
  );
}

function mappedValues(data: Record<string, string>, columns: MappedColumn[]) {
  const values: Partial<Record<StandardFieldKey, string>> = {};
  for (const column of columns) {
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

export function buildRecordFieldUpdates(
  data: Record<string, string>,
  columns: MappedColumn[],
): Prisma.RecordUpdateInput {
  const fields = mappedValues(data, columns);
  const national = fields.national_id ?? "";
  const shamCash = fields.sham_cash ?? "";
  const nationalCols = nationalIdColumns(national);
  return {
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

/** Non-duplicate quality issues for a single row (missing/invalid/phone/sham). */
function singleRowIssues(
  fileId: string,
  rowIndex: number,
  fields: Partial<Record<StandardFieldKey, string>>,
): Prisma.DataQualityIssueCreateManyInput[] {
  const issues: Prisma.DataQualityIssueCreateManyInput[] = [];
  const nationalRaw = fields.national_id ?? "";
  const issue = nationalIdIssue(nationalRaw);
  if (issue === "missing") {
    issues.push({
      fileId,
      rowIndex,
      issueType: DataQualityIssueType.MISSING_NATIONAL_ID,
      columnName: "الرقم الوطني",
      rawValue: nationalRaw,
    });
  } else if (issue !== null) {
    issues.push({
      fileId,
      rowIndex,
      issueType: DataQualityIssueType.INVALID_NATIONAL_ID,
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
  return issues;
}

export type SaveEditInput = {
  recordId: string;
  fileColumnId?: string;
  headerRaw?: string;
  newValue: string;
};

export async function saveRecordEdit(input: SaveEditInput) {
  const newValue = (input.newValue ?? "").toString();
  if (newValue.length > 5000) throw new Error("القيمة الجديدة طويلة جدًا.");

  const record = await prisma.record.findUnique({
    where: { id: input.recordId },
    include: { file: { include: { columns: true } } },
  });
  if (!record) throw new Error("السجل غير موجود.");

  const columns = record.file.columns;
  const target = input.fileColumnId
    ? columns.find((c) => c.id === input.fileColumnId)
    : columns.find((c) => c.headerRaw === input.headerRaw);
  if (!target) throw new Error("العمود غير موجود في هذا الملف.");

  const data = rowData(record.data);
  const oldValue = data[target.headerRaw] ?? "";
  if (oldValue === newValue) return { changed: false as const, oldValue, newValue };

  const mappedColumns: MappedColumn[] = columns.map((c) => ({
    headerRaw: c.headerRaw,
    standardField: c.standardField
      ? (c.standardField.toLowerCase() as StandardFieldKey)
      : null,
  }));
  const nextData = { ...data, [target.headerRaw]: newValue };
  const fieldUpdates = buildRecordFieldUpdates(nextData, mappedColumns);
  const nextFields = mappedValues(nextData, mappedColumns);

  // National-ID bookkeeping for targeted duplicate repair.
  const prevNationalRaw = currentNationalRaw(data, mappedColumns);
  const nextNationalRaw = nextFields.national_id ?? "";
  const prevValidNum = validNationalNum(prevNationalRaw);
  const nextValidNum = validNationalNum(nextNationalRaw);
  const nationalChanged = prevNationalRaw !== nextNationalRaw;

  const freshIssues = singleRowIssues(record.fileId, record.rowIndex, nextFields);

  await prisma.$transaction(async (tx) => {
    await tx.recordEdit.create({
      data: {
        recordId: record.id,
        fileId: record.fileId,
        fileColumnId: target.id,
        headerRaw: target.headerRaw,
        oldValue,
        newValue,
      },
    });
    await tx.record.update({ where: { id: record.id }, data: { data: nextData, ...fieldUpdates } });

    // Rebuild this row's non-duplicate, non-empty issues.
    await tx.dataQualityIssue.deleteMany({
      where: {
        fileId: record.fileId,
        rowIndex: record.rowIndex,
        issueType: {
          in: [
            DataQualityIssueType.MISSING_NATIONAL_ID,
            DataQualityIssueType.INVALID_NATIONAL_ID,
            DataQualityIssueType.INVALID_PHONE,
            DataQualityIssueType.INVALID_SHAM_CASH,
          ],
        },
      },
    });
    if (freshIssues.length) await tx.dataQualityIssue.createMany({ data: freshIssues });

    // Targeted duplicate repair when the national value changed.
    if (nationalChanged) {
      await tx.dataQualityIssue.deleteMany({
        where: {
          fileId: record.fileId,
          rowIndex: record.rowIndex,
          issueType: DataQualityIssueType.DUPLICATE_NATIONAL_ID,
        },
      });
      // Self becomes duplicate if another row shares the new valid number.
      if (nextValidNum !== null) {
        const othersWithNew = await tx.record.count({
          where: { fileId: record.fileId, id: { not: record.id }, nationalIdNum: nextValidNum },
        });
        if (othersWithNew > 0) {
          await tx.dataQualityIssue.create({
            data: {
              fileId: record.fileId,
              rowIndex: record.rowIndex,
              issueType: DataQualityIssueType.DUPLICATE_NATIONAL_ID,
              columnName: "الرقم الوطني",
              rawValue: nextNationalRaw,
            },
          });
          // Ensure the other rows sharing the new value are flagged too.
          const siblings = await tx.record.findMany({
            where: { fileId: record.fileId, id: { not: record.id }, nationalIdNum: nextValidNum },
            select: { rowIndex: true },
          });
          for (const sibling of siblings) {
            const existing = await tx.dataQualityIssue.findFirst({
              where: {
                fileId: record.fileId,
                rowIndex: sibling.rowIndex,
                issueType: DataQualityIssueType.DUPLICATE_NATIONAL_ID,
              },
              select: { id: true },
            });
            if (!existing) {
              const siblingRec = await tx.record.findFirst({
                where: { fileId: record.fileId, rowIndex: sibling.rowIndex },
                select: { data: true },
              });
              const siblingData = rowData(siblingRec?.data);
              const siblingFields = mappedValues(siblingData, mappedColumns);
              await tx.dataQualityIssue.create({
                data: {
                  fileId: record.fileId,
                  rowIndex: sibling.rowIndex,
                  issueType: DataQualityIssueType.DUPLICATE_NATIONAL_ID,
                  columnName: "الرقم الوطني",
                  rawValue: siblingFields.national_id ?? "",
                },
              });
            }
          }
        }
      }
      // Rows left behind on the old value may no longer be duplicates.
      if (prevValidNum !== null && prevValidNum !== nextValidNum) {
        const remaining = await tx.record.count({
          where: { fileId: record.fileId, nationalIdNum: prevValidNum },
        });
        if (remaining <= 1) {
          const leftovers = await tx.record.findMany({
            where: { fileId: record.fileId, nationalIdNum: prevValidNum },
            select: { rowIndex: true },
          });
          for (const leftover of leftovers) {
            await tx.dataQualityIssue.deleteMany({
              where: {
                fileId: record.fileId,
                rowIndex: leftover.rowIndex,
                issueType: DataQualityIssueType.DUPLICATE_NATIONAL_ID,
              },
            });
          }
        }
      }
    }

    await tx.activityLog.create({
      data: {
        action: ActivityAction.RECORD_EDITED,
        targetName: record.file.name,
        details: {
          fileId: record.fileId,
          recordId: record.id,
          rowIndex: record.rowIndex,
          headerRaw: target.headerRaw,
          oldValue,
          newValue,
        },
      },
    });
  });

  return { changed: true as const, oldValue, newValue };
}

function currentNationalRaw(data: Record<string, string>, columns: MappedColumn[]) {
  return mappedValues(data, columns).national_id ?? "";
}

function validNationalNum(raw: string): bigint | null {
  if (nationalIdIssue(raw) !== null) return null;
  const digits = nationalIdDigits(raw);
  if (digits === null) return null;
  try {
    const num = BigInt(digits);
    return num <= BigInt("9223372036854775807") ? num : null;
  } catch {
    return null;
  }
}

export type RecordEditInfo = {
  id: string;
  headerRaw: string;
  fileColumnId: string | null;
  oldValue: string;
  newValue: string;
  createdAt: Date;
};

/** All edits for one record, newest first, plus per-column edit summary. */
export async function getRecordEdits(recordId: string): Promise<{
  edits: RecordEditInfo[];
  editedHeaders: Record<string, { count: number; originalValue: string; lastValue: string; lastAt: Date }>;
}> {
  const edits = await prisma.recordEdit.findMany({
    where: { recordId },
    orderBy: { createdAt: "desc" },
  });
  const editedHeaders: Record<string, { count: number; originalValue: string; lastValue: string; lastAt: Date }> = {};
  // Oldest-first pass: first oldValue is the true Excel original, last write wins.
  for (const edit of [...edits].reverse()) {
    const existing = editedHeaders[edit.headerRaw];
    if (!existing) {
      editedHeaders[edit.headerRaw] = {
        count: 1,
        originalValue: edit.oldValue,
        lastValue: edit.newValue,
        lastAt: edit.createdAt,
      };
    } else {
      existing.count += 1;
      existing.lastValue = edit.newValue;
      existing.lastAt = edit.createdAt;
    }
  }
  return {
    edits: edits.map((e) => ({
      id: e.id,
      headerRaw: e.headerRaw,
      fileColumnId: e.fileColumnId,
      oldValue: e.oldValue,
      newValue: e.newValue,
      createdAt: e.createdAt,
    })),
    editedHeaders,
  };
}

/** Which of the given files have at least one manual edit. */
export async function getEditedFileIds(fileIds: string[]): Promise<Set<string>> {
  if (!fileIds.length) return new Set();
  const rows = await prisma.recordEdit.findMany({
    where: { fileId: { in: fileIds } },
    select: { fileId: true },
    distinct: ["fileId"],
  });
  return new Set(rows.map((r) => r.fileId));
}

export async function getEditedFilesSummary() {
  const groups = await prisma.recordEdit.groupBy({
    by: ["fileId"],
    _count: { id: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
  });
  if (!groups.length) return [];
  const files = await prisma.file.findMany({
    where: { id: { in: groups.map((g) => g.fileId) } },
    include: { group: { select: { id: true, name: true } } },
  });
  const byId = new Map(files.map((f) => [f.id, f]));
  return groups.flatMap((g) => {
    const file = byId.get(g.fileId);
    if (!file) return [];
    return [
      {
        fileId: file.id,
        fileName: file.name,
        groupId: file.groupId,
        groupName: file.group.name,
        rowCount: file.rowCount,
        editCount: g._count.id,
        lastEditAt: g._max.createdAt,
      },
    ];
  });
}

export async function listEdits(input: {
  fileId?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, input.pageSize ?? 25));
  const where = input.fileId ? { fileId: input.fileId } : {};
  const [total, edits] = await prisma.$transaction([
    prisma.recordEdit.count({ where }),
    prisma.recordEdit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        file: { select: { id: true, name: true, groupId: true, group: { select: { name: true } } } },
        record: {
          select: {
            id: true,
            rowIndex: true,
            sfFullName: true,
            sfFirstName: true,
            sfFatherName: true,
            sfLastName: true,
          },
        },
      },
    }),
  ]);
  return {
    edits: edits.map((e) => ({
      id: e.id,
      fileId: e.fileId,
      fileName: e.file.name,
      groupId: e.file.groupId,
      groupName: e.file.group.name,
      recordId: e.recordId,
      rowIndex: e.record.rowIndex,
      fullName:
        e.record.sfFullName ||
        [e.record.sfFirstName, e.record.sfFatherName, e.record.sfLastName]
          .filter(Boolean)
          .join(" "),
      headerRaw: e.headerRaw,
      oldValue: e.oldValue,
      newValue: e.newValue,
      createdAt: e.createdAt,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}
