import { describe, expect, it } from "vitest";
import {
  duplicateReason,
  missingInMainReason,
  nationalIdIssueReason,
  readNationalId,
} from "@/lib/sheet-merge/key";

describe("readNationalId", () => {
  it("converts the cell value to a number and links on more than 7 characters", () => {
    expect(readNationalId("123456789")).toEqual({
      key: "123456789",
      issue: null,
      digits: "123456789",
    });
    expect(readNationalId(123456789)).toEqual({
      key: "123456789",
      issue: null,
      digits: "123456789",
    });
    // Arabic digits, spaces, non-breaking spaces and thousands separators.
    expect(readNationalId("١٢٣٤٥٦٧٨٩").key).toBe("123456789");
    expect(readNationalId(" ٠٠١٢٣\u00a0٤٥٦\t٧٨٩ ").key).toBe("123456789");
    expect(readNationalId("1,234,567,890").key).toBe("1234567890");
    expect(readNationalId("١٬٢٣٤٬٥٦٧٬٨٩٠").key).toBe("1234567890");
    // Leading zeros never take part in the link.
    expect(readNationalId("00012345678").key).toBe("12345678");
    // A scientific-notation text still holds an exact integer.
    expect(readNationalId("1.23456789E+9").key).toBe("1234567890");
  });

  it("accepts exactly 8 digits and rejects 7 or fewer", () => {
    expect(readNationalId("12345678").key).toBe("12345678");
    expect(readNationalId("1234567")).toEqual({ key: null, issue: "short", digits: "1234567" });
    // 8 characters that shrink to 7 digits after removing the leading zero.
    expect(readNationalId("01234567")).toEqual({ key: null, issue: "short", digits: "1234567" });
  });

  it("reports unreadable and empty values", () => {
    expect(readNationalId("")).toEqual({ key: null, issue: "empty", digits: "" });
    expect(readNationalId("   ")).toEqual({ key: null, issue: "empty", digits: "" });
    expect(readNationalId(null)).toEqual({ key: null, issue: "empty", digits: "" });
    expect(readNationalId("123abc")).toEqual({ key: null, issue: "characters", digits: "" });
    expect(readNationalId("غير معروف")).toEqual({ key: null, issue: "characters", digits: "" });
    // A decimal value is not an id.
    expect(readNationalId("12345678.5")).toEqual({ key: null, issue: "characters", digits: "" });
  });

  it("explains every reason in Arabic", () => {
    expect(nationalIdIssueReason("empty")).toContain("فارغ");
    expect(nationalIdIssueReason("characters")).toContain("أحرف غير رقمية");
    expect(nationalIdIssueReason("short", "1234567")).toContain("7 محارف");
    expect(duplicateReason(12)).toContain("الصف 12");
    expect(missingInMainReason("الأساسية")).toContain("الأساسية");
  });
});
