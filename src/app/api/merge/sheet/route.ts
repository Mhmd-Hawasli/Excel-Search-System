import { NextResponse } from "next/server";
import { inspectMergeSheet } from "@/lib/merge/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: unknown;
    sheetName?: unknown;
  } | null;
  if (
    !body ||
    typeof body.token !== "string" ||
    typeof body.sheetName !== "string" ||
    !body.sheetName.trim()
  )
    return NextResponse.json({ error: "بيانات غير صالحة." }, { status: 400 });
  try {
    return NextResponse.json(await inspectMergeSheet(body.token, body.sheetName));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر فحص الورقة." },
      { status: 422 },
    );
  }
}
