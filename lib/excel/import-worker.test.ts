import { describe, expect, it } from "vitest";
import type { UploadConfig } from "@/lib/excel/config";
import { recordInput, qualityIssues } from "@/lib/excel/import-worker";
import { normalizeStored } from "@/lib/normalization/arabic";

describe("recordInput contract codes", () => {
  it("stores and normalizes primary and secondary contract codes independently", () => {
    const config: UploadConfig = {
      token: "d57df626-8e31-4a3d-b8b8-d01bb4648d4f",
      groupId: "2254b5b0-065d-4846-ab8a-d5f57f7655ab",
      name: "ملف العقود",
      description: "",
      originalFilename: "contracts.xlsx",
      sheetName: "Sheet1",
      sheetIndex: 1,
      totalRows: 1,
      columns: [
        {
          headerRaw: "رمز العقد الأساسي",
          headerNormalized: "رمز العقد الاساسي",
          columnIndex: 1,
          standardField: "contract_code",
          categoryId: null,
        },
        {
          headerRaw: "رمز العقد الثانوي",
          headerNormalized: "رمز العقد الثانوي",
          columnIndex: 2,
          standardField: "secondary_contract_code",
          categoryId: null,
        },
      ],
    };

    const input = recordInput(
      "file-id",
      2,
      { "رمز العقد الأساسي": "MAIN-A-104", "رمز العقد الثانوي": "ALT-B-220" },
      config,
    );

    expect(input.sfContractCode).toBe("MAIN-A-104");
    expect(input.nContractCode).toBe(normalizeStored("MAIN-A-104"));
    expect(input.sfSecondaryContractCode).toBe("ALT-B-220");
    expect(input.nSecondaryContractCode).toBe(normalizeStored("ALT-B-220"));
  });
});

describe("recordInput Sham Cash", () => {
  const config: UploadConfig = {
    token: "d57df626-8e31-4a3d-b8b8-d01bb4648d4f",
    groupId: "2254b5b0-065d-4846-ab8a-d5f57f7655ab",
    name: "ملف شام كاش",
    description: "",
    originalFilename: "sham-cash.xlsx",
    sheetName: "Sheet1",
    sheetIndex: 1,
    totalRows: 1,
    columns: [
      {
        headerRaw: "الشام كاش",
        headerNormalized: "الشام كاش",
        columnIndex: 1,
        standardField: "sham_cash",
        categoryId: null,
      },
    ],
  };

  it("stores a 16-digit value as bigint", () => {
    const input = recordInput("file-id", 2, { "الشام كاش": "1234 5678 9012 3456" }, config);
    expect(input.sfShamCash).toBe(1234567890123456n);
  });

  it("does not store an invalid value in the standardized columns", () => {
    const input = recordInput("file-id", 2, { "الشام كاش": "12345" }, config);
    expect(input.sfShamCash).toBeNull();
  });
});

describe("national ID import quality", () => {
  const config: UploadConfig = {
    token: "d57df626-8e31-4a3d-b8b8-d01bb4648d4f",
    groupId: "2254b5b0-065d-4846-ab8a-d5f57f7655ab",
    name: "أرقام وطنية",
    description: "",
    originalFilename: "ids.xlsx",
    sheetName: "Sheet1",
    sheetIndex: 1,
    totalRows: 1,
    columns: [
      {
        headerRaw: "الرقم الوطني",
        headerNormalized: "الرقم الوطني",
        columnIndex: 1,
        standardField: "national_id",
        categoryId: null,
      },
    ],
  };
  it("stores a number and keeps the original cell while displaying eleven digits", () => {
    const data = { "الرقم الوطني": "٠٠١٢٣ ٤٥٦ ٧٨٩" };
    const input = recordInput("file-id", 2, data, config);
    expect(input).toMatchObject({
      sfNationalId: 123456789n,
      nationalIdNum: 123456789n,
      dNationalId: "00123456789",
      data,
    });
    expect(qualityIssues("file-id", 2, data, config, new Set())).toEqual([]);
  });
  it.each(["123456789", "1234567890", "12345678901"])("accepts %s", (raw) => {
    expect(qualityIssues("file-id", 2, { "الرقم الوطني": raw }, config, new Set())).toEqual([]);
  });
  it.each(["00012345678", "12345678", "123456789012", "123456789A", "9223372036854775808"])(
    "reports an integrity issue for %s",
    (raw) => {
      expect(qualityIssues("file-id", 2, { "الرقم الوطني": raw }, config, new Set())).toMatchObject(
        [{ issueType: "INVALID_NATIONAL_ID", rawValue: raw }],
      );
    },
  );
  it("recognizes duplicates despite whitespace, digit script and leading zeros", () => {
    const seen = new Set<string>();
    expect(qualityIssues("file-id", 2, { "الرقم الوطني": "123456789" }, config, seen)).toEqual([]);
    expect(
      qualityIssues("file-id", 3, { "الرقم الوطني": "٠٠١٢٣ ٤٥٦ ٧٨٩" }, config, seen),
    ).toMatchObject([{ issueType: "DUPLICATE_NATIONAL_ID" }]);
  });
});
