import { describe, expect, it } from "vitest";
import { STANDARD_FIELD_LABELS, suggestStandardField } from "@/lib/excel/standard-fields";

describe("standard-field suggestions", () => {
  it.each([
    ["الرقم الوطنى", "national_id"], ["رقم وطني", "national_id"], ["اسم الوالدة", "mother_name"],
    ["رقم الموبايل", "phone"], ["كود العقد", "contract_code"], ["رمز العقد الأساسي", "contract_code"],
    ["رمز العقد الثانوي", "secondary_contract_code"], ["كود العقد الثانوي", "secondary_contract_code"], ["رمز العقد الإضافي", "secondary_contract_code"], ["الرقم الوظيفي", "personal_no"],
  ] as const)("suggests %s as %s", (header, expected) => expect(suggestStandardField(header)).toBe(expected));
  it("exposes the new primary and secondary labels", () => {
    expect(STANDARD_FIELD_LABELS.contract_code).toBe("رمز العقد الأساسي");
    expect(STANDARD_FIELD_LABELS.secondary_contract_code).toBe("رمز العقد الثانوي");
  });
  it("does not force an unrelated header", () => expect(suggestStandardField("ملاحظات إدارية طويلة")).toBeNull());
});
