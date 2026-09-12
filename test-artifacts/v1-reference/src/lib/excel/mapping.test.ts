import { describe, expect, it } from "vitest";
import { ensureUniqueStandardFields } from "@/lib/excel/mapping";

describe("ensureUniqueStandardFields", () => {
  it("keeps the primary join key mapped even when a template maps national ID elsewhere", () => {
    expect(
      ensureUniqueStandardFields(
        [
          { columnIndex: 1, standardField: "national_id" as const },
          { columnIndex: 2, standardField: "personal_no" as const },
        ],
        2,
      ),
    ).toEqual([
      { columnIndex: 1, standardField: null },
      { columnIndex: 2, standardField: "national_id" },
    ]);
  });
  it("keeps unlinked fields valid and clears only duplicate automatic mappings", () => {
    expect(
      ensureUniqueStandardFields([
        { header: "الاسم الأول", standardField: "first_name" as const },
        { header: "اسم المستفيد", standardField: "first_name" as const },
        { header: "حقل إضافي", standardField: null },
        { header: "الرقم الوطني", standardField: "national_id" as const },
      ]),
    ).toEqual([
      { header: "الاسم الأول", standardField: "first_name" },
      { header: "اسم المستفيد", standardField: null },
      { header: "حقل إضافي", standardField: null },
      { header: "الرقم الوطني", standardField: "national_id" },
    ]);
  });
});
