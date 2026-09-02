import { describe, expect, it } from "vitest";
import { digitsOnly, matchesNormalizedText, matchesNumeric, nationalIdAsBigInt, normalizeNationalId, normalizeQuery, normalizeStored } from "./arabic";

describe("Arabic normalization mandatory matching cases", () => {
  it.each([
    ["احمد", "أحمد"], ["احمد", "إحمد"], ["احمد", "آحمد"],
    ["فاطمه", "فاطمة"], ["فاطمة", "فاطمه"],
    ["مصطفي", "مصطفى"], ["يحيى", "يحيي"],
    ["عبدالله", "عبد الله"], ["عبد الله", "عبدالله"],
    ["قاسم", "القاسم"], ["القاسم", "قاسم"],
    ["احمد محمد", "أحمد علي محمد"], ["الله", "عبدالله"],
    ["مُحَمَّــد", "محمد"],
  ])("matches query %s against stored value %s", (query, stored) => {
    expect(matchesNormalizedText(query, stored)).toBe(true);
  });

  it("matches numeric substrings", () => expect(matchesNumeric("555", "123555123")).toBe(true));
  it("converts Arabic-Indic digits", () => expect(normalizeStored("٠١٢٣")).toBe("0123"));
});

describe("normalization helpers", () => {
  it("applies storage transformations in the required order", () => {
    expect(normalizeStored("  عَبْد   إلهــام  ABC ۱۲٣ ")).toBe("عبدالهام abc 123");
  });
  it("only strips the definite article when three characters remain", () => {
    expect(normalizeQuery("القاسم الله")).toEqual(["قاسم", "الله"]);
  });
  it("extracts and pads national IDs without damaging the raw value", () => {
    expect(digitsOnly(" ١٢-۳ ")).toBe("123");
    expect(normalizeNationalId("123")).toBe("00000000123");
    expect(nationalIdAsBigInt("00000000123")).toBe(123n);
    expect(nationalIdAsBigInt("123456789012")).toBeNull();
  });
});
