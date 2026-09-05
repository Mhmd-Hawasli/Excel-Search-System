import type { StandardFieldKey } from "@/lib/excel/types";
import { digitsOnly, normalizeQuery } from "@/lib/normalization/arabic";
import { functionalCategoryQuery } from "@/lib/format/functional-category";
import { SEARCH_FIELD_MAP, SEARCH_FIELDS, type SearchField } from "@/lib/search/fields";

export type SearchMode = "full" | "custom";
export type SearchPlanInput = { query: string; mode: SearchMode; field?: StandardFieldKey };
export type SearchPlan = { fields: SearchField[]; textTokens: string[]; numericNeedle: string; normalizedText: string };

export function buildSearchPlan(input: SearchPlanInput): SearchPlan {
  const allTokens = normalizeQuery(input.query);
  const textTokens = allTokens.filter((token) => /\p{L}/u.test(token));
  const numericNeedle = digitsOnly(input.query);
  if (input.mode === "custom" && input.field) {
    const field = SEARCH_FIELD_MAP[input.field];
    return {
      fields: [field],
      textTokens: field.type === "text" ? allTokens : [],
      numericNeedle: field.type === "numeric" ? numericNeedle : "",
      normalizedText: allTokens.join(" "),
    };
  }
  const hasText = textTokens.length > 0;
  const hasNumbers = numericNeedle.length > 0;
  const hasFunctionalCategory = functionalCategoryQuery(input.query) !== null;
  return {
    fields: SEARCH_FIELDS.filter(
      (field) =>
        (field.type === "text" && hasText) ||
        (field.type === "numeric" && hasNumbers) ||
        (field.type === "functional_category" && hasFunctionalCategory),
    ),
    textTokens,
    numericNeedle,
    normalizedText: allTokens.join(" "),
  };
}
