import { randomUUID } from "node:crypto";
import { exportSheetMergeWorkbook } from "@/lib/sheet-merge/exporter";
import {
  buildSheetMerge,
  type BuiltSheetMerge,
  type SheetMergeProgress,
} from "@/lib/sheet-merge/merge";
import {
  EXPORT_BASENAME,
  type SheetMergeResult,
  type SheetMergeRunInput,
  type UploadInspection,
  type UploadedWorkbook,
} from "@/lib/sheet-merge/types";

/**
 * Temporary in-memory storage of this section — the ONLY place its data lives.
 *
 * Nothing is written to the database and nothing is written to disk: the
 * uploaded workbook, the merge results and the generated export stay in three
 * `globalThis` maps and disappear on restart. `globalThis` (the same pattern
 * as `lib/db/prisma.ts`) keeps the maps alive across the individually bundled
 * route modules and dev hot reloads.
 */

const UPLOAD_TTL_MS = 12 * 60 * 60 * 1000;
/** Export buffers are single-use downloads, so they expire quickly. */
const EXPORT_TTL_MS = 15 * 60 * 1000;

export type SheetMergeSession = {
  id: string;
  createdAt: number;
  uploadId: string;
  input: { nationalIdColumn: number; sheetNames: string[] };
  result: SheetMergeResult;
};

export type SheetMergeExport = {
  id: string;
  createdAt: number;
  buffer: Buffer;
  filename: string;
  size: number;
  sheetCount: number;
};

const globalForSheetMerge = globalThis as unknown as {
  __sheetMergeUploads?: Map<string, UploadedWorkbook>;
  __sheetMergeSessions?: Map<string, SheetMergeSession>;
  __sheetMergeExportBuffers?: Map<string, SheetMergeExport>;
};

const uploads = globalForSheetMerge.__sheetMergeUploads ?? new Map<string, UploadedWorkbook>();
const sessions = globalForSheetMerge.__sheetMergeSessions ?? new Map<string, SheetMergeSession>();
const exportBuffers =
  globalForSheetMerge.__sheetMergeExportBuffers ?? new Map<string, SheetMergeExport>();
globalForSheetMerge.__sheetMergeUploads = uploads;
globalForSheetMerge.__sheetMergeSessions = sessions;
globalForSheetMerge.__sheetMergeExportBuffers = exportBuffers;

function prune<T extends { createdAt: number }>(store: Map<string, T>, ttl: number) {
  const cutoff = Date.now() - ttl;
  for (const [id, entry] of store) if (entry.createdAt < cutoff) store.delete(id);
}

function pruneAll() {
  prune(uploads, UPLOAD_TTL_MS);
  prune(sessions, UPLOAD_TTL_MS);
  prune(exportBuffers, EXPORT_TTL_MS);
}

/** Keeps the uploaded workbook in memory and returns the wizard inspection. */
export function storeUploadedWorkbook(
  uploaded: UploadedWorkbook,
  inspection: UploadInspection,
): UploadInspection {
  pruneAll();
  uploads.set(uploaded.id, uploaded);
  return inspection;
}

export function getUploadedWorkbook(uploadId: string): UploadedWorkbook {
  const uploaded = uploads.get(uploadId);
  if (!uploaded)
    throw new Error("انتهت الجلسة المؤقتة للملف أو لم تعد موجودة. يرجى رفع الملف من جديد.");
  return uploaded;
}

/** Runs the merge and keeps the result in a temporary in-memory session. */
export function createSheetMergeSession(
  input: SheetMergeRunInput,
  onProgress?: SheetMergeProgress,
): SheetMergeSession {
  const uploaded = getUploadedWorkbook(input.uploadId);
  const built = buildSheetMerge(uploaded, input, onProgress);
  const session: SheetMergeSession = {
    id: randomUUID(),
    createdAt: Date.now(),
    uploadId: input.uploadId,
    input: { nationalIdColumn: input.nationalIdColumn, sheetNames: input.sheetNames },
    result: { sessionId: "", ...built.stats },
  };
  session.result.sessionId = session.id;
  pruneAll();
  sessions.set(session.id, session);
  return session;
}

export function getSheetMergeSession(sessionId: string): SheetMergeSession {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("انتهت جلسة الدمج أو لم تعد موجودة. يرجى إعادة الدمج من جديد.");
  return session;
}

/**
 * Builds the export workbook from the temporary session (nothing is stored on
 * disk) and holds the bytes for the download.
 */
export async function prepareSheetMergeExport(
  sessionId: string,
  onProgress?: SheetMergeProgress,
): Promise<{ downloadId: string; filename: string; size: number; sheetCount: number }> {
  const session = getSheetMergeSession(sessionId);
  const uploaded = getUploadedWorkbook(session.uploadId);
  const built: BuiltSheetMerge = buildSheetMerge(uploaded, session.input);
  const buffer = await exportSheetMergeWorkbook(built, onProgress);
  const date = new Date().toISOString().slice(0, 10);
  const payload: SheetMergeExport = {
    id: randomUUID(),
    createdAt: Date.now(),
    buffer,
    filename: `${EXPORT_BASENAME}-${date}.xlsx`,
    size: buffer.length,
    sheetCount: 1 + built.unlinkedSheets.length,
  };
  prune(exportBuffers, EXPORT_TTL_MS);
  exportBuffers.set(payload.id, payload);
  return {
    downloadId: payload.id,
    filename: payload.filename,
    size: payload.size,
    sheetCount: payload.sheetCount,
  };
}

export function getSheetMergeExport(downloadId: string): SheetMergeExport {
  const payload = exportBuffers.get(downloadId);
  if (!payload) throw new Error("انتهت صلاحية ملف التصدير المؤقت. يرجى تصدير الملف من جديد.");
  return payload;
}
