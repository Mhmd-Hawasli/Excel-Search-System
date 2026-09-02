import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { backupSchema } from "@/lib/backup/schema";
import { CATEGORY_LIMIT_MESSAGE, MAX_CUSTOM_CATEGORIES } from "@/lib/categories/config";

function backupWithCategoryCount(count: number) {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    application: "excel-archive-search",
    data: {
      groups: [],
      categories: Array.from({ length: count }, (_, index) => ({ id: randomUUID(), name: `فئة ${index + 1}`, sortOrder: index, createdAt: new Date() })),
      files: [],
      fileColumns: [],
      records: [],
      dataQualityIssues: [],
      mappingTemplates: [],
      uploadJobs: [],
      activityLogs: [],
    },
  };
}

describe("backup category limit", () => {
  it("accepts seven custom categories", () => {
    expect(backupSchema.safeParse(backupWithCategoryCount(MAX_CUSTOM_CATEGORIES)).success).toBe(true);
  });

  it("rejects a backup containing more than seven custom categories", () => {
    const result = backupSchema.safeParse(backupWithCategoryCount(MAX_CUSTOM_CATEGORIES + 1));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe(CATEGORY_LIMIT_MESSAGE);
  });
});
