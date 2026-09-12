import { NextResponse } from "next/server";
import { apiNotFound, isFileVisible, requireApiPermission } from "@/lib/auth/session-user";
import { prisma } from "@/lib/db/prisma";
import { buildFileExportWorkbook } from "@/lib/excel/file-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toHeaderMap(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireApiPermission("export.run");
  if (auth instanceof NextResponse) return auth;
  const file = await prisma.file.findUnique({
    where: { id },
    include: {
      group: { select: { name: true } },
      columns: { orderBy: { columnIndex: "asc" } },
    },
  });
  if (!file) {
    return Response.json({ error: "الملف غير موجود." }, { status: 404 });
  }
  if (!(await isFileVisible(auth.user, file))) return apiNotFound();

  const [records, edits] = await prisma.$transaction([
    prisma.record.findMany({
      where: { fileId: id },
      orderBy: { rowIndex: "asc" },
      select: { id: true, rowIndex: true, data: true, fmtFills: true, fmtFontColors: true },
    }),
    prisma.recordEdit.findMany({
      where: { fileId: id },
      orderBy: { createdAt: "asc" },
      select: { headerRaw: true, oldValue: true, recordId: true },
    }),
  ]);

  const buffer = await buildFileExportWorkbook({
    sheetName: file.sheetName,
    columns: file.columns.map((column) => column.headerRaw),
    records: records.map((record) => ({
      id: record.id,
      rowIndex: record.rowIndex,
      data: record.data,
      fmtFills: toHeaderMap(record.fmtFills),
      fmtFontColors: toHeaderMap(record.fmtFontColors),
    })),
    edits,
  });

  const date = new Date().toISOString().slice(0, 10);
  const filename = `${file.name}-معدل-${date}.xlsx`;
  const encoded = encodeURIComponent(filename);
  return new Response(Buffer.from(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename*=UTF-8''${encoded}`,
      "cache-control": "no-store",
    },
  });
}
