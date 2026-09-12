import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "@/lib/search/plan";

describe("search planning", () => {
  it("uses numeric fields for a purely numeric full query", () => {
    const plan = buildSearchPlan({ query: "١٢٣-٥٥٥", mode: "full" });
    expect(plan.fields.every((field) => field.type === "numeric")).toBe(true);
    expect(plan.numericNeedle).toBe("123555");
  });
  it("uses text fields and normalized AND tokens for an Arabic query", () => {
    const plan = buildSearchPlan({ query: "أحمد القاسم", mode: "full" });
    expect(plan.fields.every((field) => field.type === "text")).toBe(true);
    expect(plan.textTokens).toEqual(["احمد", "قاسم"]);
  });
  it("uses both families for mixed full search", () => {
    const plan = buildSearchPlan({ query: "أحمد 555", mode: "full" });
    expect(new Set(plan.fields.map((field) => field.type))).toEqual(new Set(["text", "numeric"]));
  });
  it("restricts a custom search to exactly one selected field", () => {
    const plan = buildSearchPlan({ query: "٠٥٥٥", mode: "custom", field: "phone" });
    expect(plan.fields.map((field) => field.key)).toEqual(["phone"]);
    expect(plan.numericNeedle).toBe("0555");
  });
  it("includes the functional category for Arabic ordinal full search", () => {
    const plan = buildSearchPlan({ query: "الفئة الأولى", mode: "full" });
    expect(plan.fields.map((field) => field.key)).toContain("functional_category");
  });
  it("matches any Arabic spelling of the functional category in full search", () => {
    expect(buildSearchPlan({ query: "اولى", mode: "full" }).fields.map((field) => field.key)).toContain("functional_category");
    expect(buildSearchPlan({ query: "ثان", mode: "full" }).fields.map((field) => field.key)).toContain("functional_category");
    expect(buildSearchPlan({ query: "مس", mode: "full" }).fields.map((field) => field.key)).toContain("functional_category");
  });
  it.each(["job_title", "functional_category", "organizational_level"] as const)("supports custom searching by %s", (field) => {
    const plan = buildSearchPlan({ query: field === "functional_category" ? "ثالثة" : "مهندس", mode: "custom", field });
    expect(plan.fields.map((item) => item.key)).toEqual([field]);
  });
  it.each(["contract_code", "secondary_contract_code"] as const)("supports custom searching by %s", (field) => {
    const plan = buildSearchPlan({ query: "CN-2026-A", mode: "custom", field });
    expect(plan.fields.map((item) => item.key)).toEqual([field]);
    expect(plan.textTokens).toEqual(["cn-2026-a"]);
  });
});
