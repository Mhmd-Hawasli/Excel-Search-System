import { z } from "zod";
import { STANDARD_FIELD_KEYS } from "@/lib/excel/types";
import { SEARCH_SORT_KEYS } from "@/lib/search/sort";

const searchParametersSchema = z
  .object({
    q: z.string().max(200).default(""),
    mode: z.enum(["full", "custom"]).default("full"),
    field: z.enum(STANDARD_FIELD_KEYS).optional(),
    groupIds: z.array(z.string().uuid()).default([]),
    fileIds: z.array(z.string().uuid()).default([]),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(10).max(100).default(25),
    sortBy: z.enum(SEARCH_SORT_KEYS).optional(),
    sortDirection: z.enum(["asc", "desc"]).default("asc"),
  })
  .refine((value) => value.mode === "full" || Boolean(value.field), {
    message: "اختر حقل البحث المخصص.",
  });

export function parseSearchParameters(parameters: URLSearchParams) {
  const groupIds = Array.from(new Set(parameters.getAll("groupId")));
  const fileIds = Array.from(new Set(parameters.getAll("fileId")));
  return searchParametersSchema.safeParse({ ...Object.fromEntries(parameters), groupIds, fileIds });
}
