import { describe, expect, it } from "vitest";
import { CONFLICT_RULES } from "@/lib/conflicts/catalog";
import { parseConflictParameters } from "@/lib/conflicts/request";

describe("conflict request filters", () => {
  it("defaults to all invalid-data rules with bounded pagination", () => {
    expect(parseConflictParameters(new URLSearchParams())).toMatchObject({
      success: true,
      data: { category: "invalid", field: "all", rule: "all", page: 1, pageSize: 25 },
    });
  });

  it.each(CONFLICT_RULES)("accepts the $key category and field", (rule) => {
    expect(
      parseConflictParameters(
        new URLSearchParams({ category: rule.category, field: rule.field, rule: rule.key }),
      ).success,
    ).toBe(true);
  });

  it.each([
    "category=unknown",
    "category=missing&rule=duplicate_national",
    "category=similar&field=sham_cash",
    "field=unknown",
    "rule=unknown",
    "field=national_id&rule=sham_short",
    "page=0",
    "page=1.5",
    "pageSize=10000",
    "page=Infinity",
    "field=national_id%27%3BDROP+TABLE+records%3B--",
  ])("rejects invalid or incompatible input: %s", (query) => {
    expect(parseConflictParameters(new URLSearchParams(query)).success).toBe(false);
  });
});
