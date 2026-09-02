import { ActivityAction, UploadJobStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runImportJob } from "@/lib/excel/import-worker";

export type ReplacementMode = "same" | "different";

export async function runReplacementJob(jobId: string, targetFileId: string, mode: ReplacementMode, temporaryName: string) {
  await runImportJob(jobId);
  const importedJob = await prisma.uploadJob.findUnique({ where: { id: jobId } });
  if (!importedJob || importedJob.status !== UploadJobStatus.DONE || !importedJob.fileId) return;
  const temporaryFileId = importedJob.fileId;
  try {
    await prisma.uploadJob.update({ where: { id: jobId }, data: { status: UploadJobStatus.INSERTING, finishedAt: null } });
    const [target, temporary] = await Promise.all([
      prisma.file.findUnique({ where: { id: targetFileId } }),
      prisma.file.findUnique({ where: { id: temporaryFileId } }),
    ]);
    if (!target || !temporary) throw new Error("تعذر العثور على أحد إصداري الملف لإتمام الاستبدال.");
    await prisma.$transaction(async (tx) => {
      await tx.activityLog.deleteMany({ where: { action: ActivityAction.FILE_UPLOADED, targetName: temporaryName } });
      if (mode === "same") {
        await tx.record.deleteMany({ where: { fileId: target.id } });
        await tx.dataQualityIssue.deleteMany({ where: { fileId: target.id } });
        await tx.fileColumn.deleteMany({ where: { fileId: target.id } });
        await tx.record.updateMany({ where: { fileId: temporary.id }, data: { fileId: target.id } });
        await tx.dataQualityIssue.updateMany({ where: { fileId: temporary.id }, data: { fileId: target.id } });
        await tx.fileColumn.updateMany({ where: { fileId: temporary.id }, data: { fileId: target.id } });
        await tx.file.delete({ where: { id: temporary.id } });
        await tx.file.update({ where: { id: target.id }, data: { originalFilename: temporary.originalFilename, sheetName: temporary.sheetName, rowCount: temporary.rowCount, columnSignature: temporary.columnSignature, uploadedAt: new Date() } });
        await tx.uploadJob.update({ where: { id: jobId }, data: { fileId: target.id, status: UploadJobStatus.DONE, finishedAt: new Date() } });
        await tx.activityLog.create({ data: { action: ActivityAction.FILE_UPDATED, targetName: target.name, details: { fileId: target.id, previousRows: target.rowCount, newRows: temporary.rowCount } } });
      } else {
        await tx.file.delete({ where: { id: target.id } });
        await tx.file.update({ where: { id: temporary.id }, data: { name: target.name, description: target.description, groupId: target.groupId, version: target.version + 1, uploadedAt: new Date() } });
        await tx.uploadJob.update({ where: { id: jobId }, data: { fileId: temporary.id, status: UploadJobStatus.DONE, finishedAt: new Date() } });
        await tx.activityLog.create({ data: { action: ActivityAction.FILE_REPLACED, targetName: target.name, details: { previousFileId: target.id, fileId: temporary.id, version: target.version + 1, previousRows: target.rowCount, newRows: temporary.rowCount } } });
      }
    }, { timeout: 60_000 });
  } catch (error) {
    await prisma.file.delete({ where: { id: temporaryFileId, name: temporaryName } }).catch(() => undefined);
    await prisma.uploadJob.update({ where: { id: jobId }, data: { fileId: null, status: UploadJobStatus.FAILED, errorMessage: error instanceof Error ? error.message : "تعذر إتمام استبدال الملف.", finishedAt: new Date() } });
  }
}
