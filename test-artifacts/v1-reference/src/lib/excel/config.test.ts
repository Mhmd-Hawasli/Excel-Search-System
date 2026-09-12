import { describe, expect, it } from "vitest";
import { uploadConfigSchema } from "@/lib/excel/config";

describe("uploadConfigSchema", () => {
  it("accepts Excel columns that are not linked to any standard field", () => {
    const result = uploadConfigSchema.safeParse({
      token: "d57df626-8e31-4a3d-b8b8-d01bb4648d4f",
      groupId: "2254b5b0-065d-4846-ab8a-d5f57f7655ab",
      name: "ملف اختبار",
      description: "",
      originalFilename: "test.xlsx",
      sheetName: "Sheet1",
      sheetIndex: 1,
      totalRows: 1,
      columns: [{
        headerRaw: "عمود إضافي",
        headerNormalized: "عمود اضافي",
        columnIndex: 1,
        standardField: null,
        categoryId: null,
      }],
    });

    expect(result.success).toBe(true);
  });
});
