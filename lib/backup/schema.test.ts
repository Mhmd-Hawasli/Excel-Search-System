import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { backupSchema } from "@/lib/backup/schema";
import { CATEGORY_LIMIT_MESSAGE, MAX_CUSTOM_CATEGORIES } from "@/lib/categories/config";

function backupWithCategoryCount(count: number) {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    application: "excel-archive-search",
    data: {
      groups: [],
      categories: Array.from({ length: count }, (_, index) => ({
        id: randomUUID(),
        name: `فئة ${index + 1}`,
        sortOrder: index,
        createdAt: new Date(),
      })),
      files: [],
      fileColumns: [],
      records: [],
      dataQualityIssues: [],
      mappingTemplates: [],
      uploadJobs: [],
      activityLogs: [],
    },
  };
}

describe("backup category limit", () => {
  it("accepts seven custom categories", () => {
    expect(backupSchema.safeParse(backupWithCategoryCount(MAX_CUSTOM_CATEGORIES)).success).toBe(
      true,
    );
  });

  it("rejects a backup containing more than seven custom categories", () => {
    const result = backupSchema.safeParse(backupWithCategoryCount(MAX_CUSTOM_CATEGORIES + 1));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe(CATEGORY_LIMIT_MESSAGE);
  });
});

function nationalBackup(values: string[], mapped = true) {
  const base = backupWithCategoryCount(0);
  const fileId = randomUUID();
  const nullableFields = Object.fromEntries(
    [
      "sfFirstName",
      "sfFatherName",
      "sfLastName",
      "sfFullName",
      "sfShamCash",
      "sfPersonalNo",
      "sfMotherName",
      "sfPhone",
      "sfContractCode",
      "nFirstName",
      "nFatherName",
      "nLastName",
      "nFullName",
      "nMotherName",
      "nContractCode",
      "dPersonalNo",
      "dPhone",
    ].map((key) => [key, null]),
  );
  return {
    ...base,
    data: {
      ...base.data,
      fileColumns: mapped
        ? [
            {
              id: randomUUID(),
              fileId,
              headerRaw: "الرقم الوطني",
              headerNormalized: "الرقم الوطني",
              columnIndex: 1,
              categoryId: null,
              standardField: "NATIONAL_ID",
              createdAt: new Date(),
            },
          ]
        : [],
      records: values.map((value, index) => ({
        ...nullableFields,
        id: randomUUID(),
        fileId,
        rowIndex: index + 2,
        data: mapped ? { "الرقم الوطني": value } : {},
        sfNationalId: value,
        dNationalId: "stale",
        nationalIdNum: "stale",
        createdAt: new Date(),
      })),
      dataQualityIssues: [
        {
          id: randomUUID(),
          fileId,
          rowIndex: 2,
          issueType: "INVALID_NATIONAL_ID",
          columnName: "الرقم الوطني",
          rawValue: values[0],
          createdAt: new Date(),
        },
        {
          id: randomUUID(),
          fileId,
          rowIndex: 2,
          issueType: "INVALID_PHONE",
          columnName: "الهاتف",
          rawValue: "x",
          createdAt: new Date(),
        },
      ],
    },
  };
}

describe("backward-compatible national ID backups", () => {
  it("normalizes legacy text and rebuilds national issues while retaining other quality issues", () => {
    const input = nationalBackup([
      "123456789",
      "٠٠١٢٣ ٤٥٦ ٧٨٩",
      "00012345678",
      "123456789012",
      "123456789A",
      "",
    ]);
    const { data } = backupSchema.parse(input);
    expect(data.records[0]).toMatchObject({
      sfNationalId: 123456789n,
      nationalIdNum: 123456789n,
      dNationalId: "00123456789",
    });
    expect(data.records[1].data).toEqual(input.data.records[1].data);
    expect(data.records[4].sfNationalId).toBeNull();
    expect(data.dataQualityIssues.map((issue) => [issue.rowIndex, issue.issueType])).toEqual([
      [2, "INVALID_PHONE"],
      [3, "DUPLICATE_NATIONAL_ID"],
      [4, "INVALID_NATIONAL_ID"],
      [5, "INVALID_NATIONAL_ID"],
      [6, "INVALID_NATIONAL_ID"],
      [7, "MISSING_NATIONAL_ID"],
    ]);
  });

  it("preserves unmapped invalid originals across a JSON export and re-import", () => {
    const parsed = backupSchema.parse(
      nationalBackup(["123456789A", "9223372036854775808", "123456789"], false),
    );
    expect(parsed.data.records[0].data).toEqual({ __national_id_original: "123456789A" });
    const serialized = JSON.parse(
      JSON.stringify(parsed, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    );
    const restored = backupSchema.parse(serialized);
    expect(restored.data.records).toEqual(parsed.data.records);
    expect(
      restored.data.dataQualityIssues.filter((issue) => issue.issueType === "INVALID_NATIONAL_ID"),
    ).toHaveLength(2);
  });

  it("uses original cells to diagnose new numeric backups", () => {
    const input = nationalBackup(["123456789A"]);
    const numericInput = {
      ...input,
      data: {
        ...input.data,
        records: input.data.records.map((entry) => ({
          ...entry,
          sfNationalId: null,
          nationalIdNum: null,
          dNationalId: null,
        })),
      },
    };
    const result = backupSchema.parse(numericInput);
    expect(result.data.records[0].sfNationalId).toBeNull();
    expect(result.data.dataQualityIssues.at(-1)?.rawValue).toBe("123456789A");
  });
});
