import { randomUUID } from "node:crypto";
import { nextKeyAfter, relinkUnmatched, runMerge, summarizeResult } from "@/lib/merge/rules";
import { readMergeSheet } from "@/lib/merge/storage";
import type { MergeMapping, MergeResult, MergeRow, MergeRunInput } from "@/lib/merge/types";

/**
 * In-memory merge sessions. Deliberately isolated: nothing here touches the
 * archive database, and sessions disappear when the server restarts.
 */
export type MergeSession = {
  id: string;
  createdAt: number;
  updatedAt: number;
  left: { filename: string; sheetName: string; headers: string[]; rows: MergeRow[] };
  right: { filename: string; sheetName: string; headers: string[]; rows: MergeRow[] };
  mappings: { left: MergeMapping; right: MergeMapping };
};

/**
 * Session state must be shared across the individually bundled route modules.
 * `globalThis` keeps the single map alive across route chunks and dev hot
 * reloads (same pattern as `lib/db/prisma.ts`), with no database involved.
 */
const globalForMerge = globalThis as unknown as { __mergeSessions?: Map<string, MergeSession> };
const sessions = globalForMerge.__mergeSessions ?? new Map<string, MergeSession>();
globalForMerge.__mergeSessions = sessions;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function pruneSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) if (session.createdAt < cutoff) sessions.delete(id);
}

export async function createMergeSession(
  input: MergeRunInput,
): Promise<{ session: MergeSession; result: MergeResult }> {
  pruneSessions();
  const [leftSheet, rightSheet] = await Promise.all([
    readMergeSheet(input.left.token, input.left.sheetName),
    readMergeSheet(input.right.token, input.right.sheetName),
  ]);
  const result = runMerge(
    { headers: leftSheet.headers, rows: leftSheet.rows, mapping: input.left.mapping },
    { headers: rightSheet.headers, rows: rightSheet.rows, mapping: input.right.mapping },
    1,
  );
  const session: MergeSession = {
    id: randomUUID(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    left: {
      filename: "الجدول الأول",
      sheetName: leftSheet.sheetName,
      headers: leftSheet.headers,
      rows: result.left,
    },
    right: {
      filename: "الجدول الثاني",
      sheetName: rightSheet.sheetName,
      headers: rightSheet.headers,
      rows: result.right,
    },
    mappings: { left: input.left.mapping, right: input.right.mapping },
  };
  sessions.set(session.id, session);
  return { session, result };
}

export function getMergeSession(sessionId: string): MergeSession {
  const session = sessions.get(sessionId);
  if (!session)
    throw new Error("انتهت جلسة الدمج أو لم تعد موجودة. يرجى إعادة رفع الملفين من جديد.");
  return session;
}

/**
 * Deletes the link key of one row (and its pair in the other table), then
 * re-applies the rules only to the rows that are left unlinked. Existing
 * keys are never touched.
 */
export function deletePairKeyAndRelink(
  sessionId: string,
  table: "left" | "right",
  rowNumber: number,
): MergeResult {
  const session = getMergeSession(sessionId);
  const side = session[table];
  const row = side.rows.find((entry) => entry.rowNumber === rowNumber);
  if (!row) throw new Error("الصف غير موجود في الجدول.");
  if (!row.key) throw new Error("الصف غير مربوط، لا يوجد مفتاح لحذفه.");
  const key = row.key;

  for (const target of [session.left.rows, session.right.rows]) {
    for (const entry of target) {
      if (entry.key === key) {
        entry.key = null;
        entry.rule = null;
        entry.confirmed = false;
      }
    }
  }

  const startKey = nextKeyAfter([...session.left.rows, ...session.right.rows]);
  const result = relinkUnmatched(
    session.left.rows,
    session.right.rows,
    session.mappings.left,
    session.mappings.right,
    startKey,
  );
  session.updatedAt = Date.now();
  session.left.rows = result.left;
  session.right.rows = result.right;
  return summarizeResult(
    session.left.rows,
    session.right.rows,
    session.mappings.left,
    session.mappings.right,
  );
}

export function sessionResult(sessionId: string): MergeResult {
  const session = getMergeSession(sessionId);
  return summarizeResult(
    session.left.rows,
    session.right.rows,
    session.mappings.left,
    session.mappings.right,
  );
}

export function sessionContent(sessionId: string): MergeSession {
  return getMergeSession(sessionId);
}
