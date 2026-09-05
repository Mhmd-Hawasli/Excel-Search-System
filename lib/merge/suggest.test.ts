import { describe, expect, it } from "vitest";
import { suggestMergeMapping } from "@/lib/merge/suggest";

describe("suggestMergeMapping", () => {
  it("suggests columns from Arabic headers", () => {
    const mapping = suggestMergeMapping([
      "الاسم الثلاثي",
      "اسم الأم",
      "الرقم الوطني",
      "الرقم الذاتي",
      "رقم حساب شام كاش",
      "رقم الهاتف",
    ]);
    expect(mapping).toMatchObject({
      fullName: 0,
      motherName: 1,
      nationalId: 2,
      personalNo: 3,
      shamCash: 4,
      phone: 5,
    });
    expect(mapping.firstName).toBeUndefined();
  });

  it("suggests split name parts when there is no triple-name column", () => {
    const mapping = suggestMergeMapping(["الاسم", "اسم الأب", "النسبة", "الرقم الوطني"]);
    expect(mapping).toMatchObject({ firstName: 0, fatherName: 1, lastName: 2, nationalId: 3 });
    expect(mapping.fullName).toBeUndefined();
  });

  it("never suggests both the triple name and its parts together", () => {
    const mapping = suggestMergeMapping(["الاسم الثلاثي", "الاسم", "اسم الأب", "النسبة"]);
    expect(mapping.fullName).toBe(0);
    expect(mapping.firstName).toBeUndefined();
    expect(mapping.fatherName).toBeUndefined();
    expect(mapping.lastName).toBeUndefined();
  });

  it("uses each Excel column at most once", () => {
    const mapping = suggestMergeMapping(["الهاتف"]);
    const used = Object.values(mapping);
    expect(new Set(used).size).toBe(used.length);
    expect(mapping.phone).toBe(0);
  });

  it("returns an empty mapping for blank or unrelated headers", () => {
    expect(suggestMergeMapping(["", "   ", "ملاحظات إدارية طويلة"])).toEqual({});
    expect(suggestMergeMapping([])).toEqual({});
  });
});
