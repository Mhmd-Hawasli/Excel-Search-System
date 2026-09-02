import { z } from "zod";
import { CONFLICT_FIELDS, CONFLICT_RULES } from "@/lib/conflicts/catalog";

const schema = z
  .object({
    category: z.enum(["invalid", "missing", "similar", "conflicting"]).default("invalid"),
    field: z
      .string()
      .refine(
        (value) => value === "all" || Object.hasOwn(CONFLICT_FIELDS, value),
        "الحقل المحدد غير صالح.",
      )
      .default("all"),
    rule: z
      .string()
      .refine(
        (value) => value === "all" || CONFLICT_RULES.some((rule) => rule.key === value),
        "الحالة الفرعية غير صالحة.",
      )
      .default("all"),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    pageSize: z.coerce.number().int().min(10).max(100).default(25),
  })
  .superRefine((input, context) => {
    const rules = CONFLICT_RULES.filter(
      (rule) =>
        rule.category === input.category && (input.field === "all" || rule.field === input.field),
    );
    if (!rules.length || (input.rule !== "all" && !rules.some((rule) => rule.key === input.rule))) {
      context.addIssue({
        code: "custom",
        message: "الحقل أو الحالة الفرعية لا ينتمي إلى الحالة المحددة.",
      });
    }
  });

export type ConflictRequest = z.infer<typeof schema>;
export function parseConflictParameters(parameters: URLSearchParams) {
  return schema.safeParse(Object.fromEntries(parameters));
}
