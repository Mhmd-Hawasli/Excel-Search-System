import { ActivityAction, UploadJobStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { BACKUP_SCHEMA_VERSION, backupSchema } from "@/lib/backup/schema";

const NONTERMINAL_JOB_STATUSES: UploadJobStatus[] = [
  UploadJobStatus.PENDING,
  UploadJobStatus.PARSING,
  UploadJobStatus.INSERTING,
];

function chunks<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

export async function exportBackup() {
  const [
    groups,
    categories,
    files,
    fileColumns,
    records,
    dataQualityIssues,
    mappingTemplates,
    uploadJobs,
    activityLogs,
    recordEdits,
  ] = await prisma.$transaction([
    prisma.group.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.category.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.file.findMany({ orderBy: { uploadedAt: "asc" } }),
    prisma.fileColumn.findMany({ orderBy: [{ fileId: "asc" }, { columnIndex: "asc" }] }),
    prisma.record.findMany({ orderBy: [{ fileId: "asc" }, { rowIndex: "asc" }] }),
    prisma.dataQualityIssue.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.mappingTemplate.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.uploadJob.findMany({ orderBy: { startedAt: "asc" } }),
    prisma.activityLog.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.recordEdit.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    application: "excel-archive-search" as const,
    data: {
      groups,
      categories,
      files,
      fileColumns,
      records: records.map((record) => ({
        ...record,
        sfNationalId: record.sfNationalId?.toString() ?? null,
        sfShamCash: record.sfShamCash?.toString() ?? null,
        nationalIdNum: record.nationalIdNum?.toString() ?? null,
      })),
      dataQualityIssues,
      mappingTemplates,
      uploadJobs,
      activityLogs,
      recordEdits,
    },
  };
}

export async function restoreBackup(input: unknown) {
  const parsed = backupSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      parsed.error.issues[0]?.message ?? "ملف النسخة الاحتياطية غير صالح أو غير متوافق.",
    );
  const data = parsed.data.data;
  await prisma.$transaction(
    async (tx) => {
      await tx.activityLog.deleteMany();
      await tx.uploadJob.deleteMany();
      await tx.group.deleteMany();
      await tx.category.deleteMany();
      if (data.groups.length) await tx.group.createMany({ data: data.groups });
      if (data.categories.length) await tx.category.createMany({ data: data.categories });
      if (data.files.length) await tx.file.createMany({ data: data.files });
      if (data.fileColumns.length) await tx.fileColumn.createMany({ data: data.fileColumns });
      for (const batch of chunks(data.records, 1000)) await tx.record.createMany({ data: batch });
      for (const batch of chunks(data.dataQualityIssues, 1000))
        await tx.dataQualityIssue.createMany({ data: batch });
      if (data.mappingTemplates.length)
        await tx.mappingTemplate.createMany({ data: data.mappingTemplates });
      if (data.recordEdits.length) await tx.recordEdit.createMany({ data: data.recordEdits });
      if (data.uploadJobs.length)
        await tx.uploadJob.createMany({
          data: data.uploadJobs.map((job) =>
            NONTERMINAL_JOB_STATUSES.includes(job.status)
              ? {
                  ...job,
                  status: UploadJobStatus.FAILED,
                  errorMessage: "أوقفت المهمة عند استعادة النسخة الاحتياطية.",
                  finishedAt: new Date(),
                }
              : job,
          ),
        });
      if (data.activityLogs.length) await tx.activityLog.createMany({ data: data.activityLogs });
      await tx.activityLog.create({
        data: {
          action: ActivityAction.BACKUP_RESTORED,
          targetName: `نسخة ${parsed.data.exportedAt.slice(0, 10)}`,
          details: {
            groups: data.groups.length,
            files: data.files.length,
            records: data.records.length,
          },
        },
      });
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  return { groups: data.groups.length, files: data.files.length, records: data.records.length };
}
