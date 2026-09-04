import { describe, expect, it } from "vitest";
import {
  formatFunctionalCategory,
  functionalCategoryQuery,
  parseFunctionalCategory,
} from "@/lib/format/functional-category";

describe("parseFunctionalCategory", () => {
  it("maps every given Arabic spelling of the first category to 1", () => {
    for (const value of ["1", "١", "01", "1.0", "الفئة الأولى", "الفئة الاولى", "الأولى", "الاولى", "اولى", "أولى", "اول", "او", "أو"]) {
      expect(parseFunctionalCategory(value), value).toBe(1);
    }
  });

  it("maps second, third, fourth and fifth categories", () => {
    expect(parseFunctionalCategory("ثان")).toBe(2);
    expect(parseFunctionalCategory("الثانية")).toBe(2);
    expect(parseFunctionalCategory("ثانية")).toBe(2);
    expect(parseFunctionalCategory("٢")).toBe(2);
    expect(parseFunctionalCategory("لث")).toBe(3);
    expect(parseFunctionalCategory("الثالثة")).toBe(3);
    expect(parseFunctionalCategory("ثالث")).toBe(3);
    expect(parseFunctionalCategory("را")).toBe(4);
    expect(parseFunctionalCategory("الرابعة")).toBe(4);
    expect(parseFunctionalCategory("رابعه")).toBe(4);
    expect(parseFunctionalCategory("مس")).toBe(5);
    expect(parseFunctionalCategory("الخامسة")).toBe(5);
    expect(parseFunctionalCategory("خامسه")).toBe(5);
    expect(parseFunctionalCategory("٥")).toBe(5);
  });

  it("treats empty values as null", () => {
    expect(parseFunctionalCategory(null)).toBeNull();
    expect(parseFunctionalCategory(undefined)).toBeNull();
    expect(parseFunctionalCategory("")).toBeNull();
    expect(parseFunctionalCategory("   \t ")).toBeNull();
  });

  it("treats unrecognized non-empty values as error 0", () => {
    expect(parseFunctionalCategory("سادسة")).toBe(0);
    expect(parseFunctionalCategory("خارج التصنيف")).toBe(0);
    expect(parseFunctionalCategory("9")).toBe(0);
    expect(parseFunctionalCategory("0")).toBe(0);
  });

  it("handles Arabic digits and mixed filler text", () => {
    expect(parseFunctionalCategory("فئة ٣")).toBe(3);
    expect(parseFunctionalCategory("الفئة  4")).toBe(4);
  });
});

describe("formatFunctionalCategory", () => {
  it("renders the Arabic ordinal form", () => {
    expect(formatFunctionalCategory(1)).toBe("الفئة الأولى");
    expect(formatFunctionalCategory("ثانية")).toBe("الفئة الثانية");
    expect(formatFunctionalCategory(3)).toBe("الفئة الثالثة");
    expect(formatFunctionalCategory(4)).toBe("الفئة الرابعة");
    expect(formatFunctionalCategory(5)).toBe("الفئة الخامسة");
  });

  it("renders an unknown category and keeps empty values empty", () => {
    expect(formatFunctionalCategory("سادسة")).toBe("فئة غير معروفة");
    expect(formatFunctionalCategory("")).toBe("");
    expect(formatFunctionalCategory(null)).toBe("");
  });
});

describe("functionalCategoryQuery", () => {
  it("returns a category only for recognizable queries", () => {
    expect(functionalCategoryQuery("الفئة الأولى")).toBe(1);
    expect(functionalCategoryQuery("ثان")).toBe(2);
    expect(functionalCategoryQuery("5")).toBe(5);
    expect(functionalCategoryQuery("أحمد 555")).toBeNull();
    expect(functionalCategoryQuery("")).toBeNull();
  });
});
