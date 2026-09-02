import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.uploadJob.findUnique({ where: { id }, select: { id: true, fileId: true, status: true, totalRows: true, processedRows: true, errorMessage: true, startedAt: true, finishedAt: true } });
  if (!job) return NextResponse.json({ error: "مهمة الرفع غير موجودة." }, { status: 404 });
  return NextResponse.json(job);
}
