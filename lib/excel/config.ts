import { z } from "zod";
import { STANDARD_FIELD_KEYS } from "@/lib/excel/types";

export const uploadConfigSchema = z.object({
  token: z.string().uuid(),
  groupId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000),
  originalFilename: z.string().min(1).max(255),
  sheetName: z.string().min(1).max(255),
  sheetIndex: z.number().int().positive(),
  totalRows: z.number().int().nonnegative(),
  linkedSheets: z
    .object({
      sheetNames: z
        .array(z.string().min(1).max(255))
        .min(1)
        .refine(
          (names) => new Set(names).size === names.length,
          "لا يمكن اختيار الورقة نفسها مرتين.",
        ),
      nationalIdColumnIndex: z.number().int().positive(),
    })
    .optional(),
  columns: z
    .array(
      z.object({
        headerRaw: z.string().min(1),
        headerNormalized: z.string(),
        columnIndex: z.number().int().positive(),
        standardField: z.enum(STANDARD_FIELD_KEYS).nullable(),
        categoryId: z.string().uuid().nullable(),
      }),
    )
    .min(1),
});

export type UploadConfig = z.infer<typeof uploadConfigSchema>;

export function linkedMappingError(
  config: Pick<UploadConfig, "linkedSheets" | "sheetIndex" | "sheetName" | "columns">,
) {
  if (!config.linkedSheets) return null;
  if (config.sheetIndex !== 1 || config.linkedSheets.sheetNames.includes(config.sheetName))
    return "الورقة الأولى هي الأساسية؛ اختر أوراقاً إضافية مختلفة عنها.";
  const key = config.columns.find(
    (column) => column.columnIndex === config.linkedSheets!.nationalIdColumnIndex,
  );
  if (key?.standardField !== "national_id")
    return "يجب إبقاء حقل الرقم الوطني مربوطاً بعمود مفتاح الربط في الورقة الأساسية.";
  return null;
}
