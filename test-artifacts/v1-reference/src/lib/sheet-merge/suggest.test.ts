import { describe, expect, it } from "vitest";
import { idValueRatio, suggestNationalIdColumn } from "@/lib/sheet-merge/suggest";

describe("suggestNationalIdColumn", () => {
  it("suggests the column titled as the national id", () => {
    const suggestion = suggestNationalIdColumn(
      ["الاسم الثلاثي", "الرقم الوطني", "رقم الهاتف"],
      [["أحمد علي", "123456789", "0999"]],
    );
    expect(suggestion.index).toBe(1);
    expect(suggestion.reason).toContain("الرقم الوطني");
  });

  it("accepts the other common titles", () => {
    expect(suggestNationalIdColumn(["الرقم القومي", "الاسم"], []).index).toBe(0);
    expect(suggestNationalIdColumn(["م", "الرقم الوطني للشخص"], []).index).toBe(1);
  });

  it("falls back to the column values when no header matches", () => {
    const suggestion = suggestNationalIdColumn(
      ["الاسم", "مفتاح"],
      [
        ["أحمد", "123456789"],
        ["ليلى", "987654321"],
        ["سامي", "112233445"],
      ],
    );
    expect(suggestion.index).toBe(1);
    expect(suggestion.reason).toContain("قيم العمود");
  });

  it("prefers the titled column over another numeric column", () => {
    const suggestion = suggestNationalIdColumn(
      ["الرقم الذاتي", "الرقم الوطني"],
      [
        ["45", "123456789"],
        ["46", "987654321"],
      ],
    );
    expect(suggestion.index).toBe(1);
  });

  it("suggests nothing when there is no id-like column", () => {
    expect(suggestNationalIdColumn(["الاسم", "المدينة"], [["أحمد", "دمشق"]])).toEqual({
      index: null,
      reason: null,
    });
  });

  it("measures the share of linkable values in a column", () => {
    expect(idValueRatio(["123456789", "987654321", "", "12"])).toBeCloseTo(2 / 3);
    expect(idValueRatio([])).toBe(0);
  });
});
