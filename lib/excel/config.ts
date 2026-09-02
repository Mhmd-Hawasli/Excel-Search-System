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
  columns: z.array(z.object({
    headerRaw: z.string().min(1),
    headerNormalized: z.string(),
    columnIndex: z.number().int().positive(),
    standardField: z.enum(STANDARD_FIELD_KEYS).nullable(),
    categoryId: z.string().uuid().nullable(),
  })).min(1),
});

export type UploadConfig = z.infer<typeof uploadConfigSchema>;
