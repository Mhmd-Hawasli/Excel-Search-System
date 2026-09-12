import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/session-user";
import { saveAndInspectMergeFile } from "@/lib/merge/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiPermission("merge.view");
  if (auth instanceof NextResponse) return auth;
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "يرجى اختيار ملف Excel." }, { status: 400 });
  if (!/\.(xlsx|xls)$/i.test(file.name))
    return NextResponse.json({ error: "الصيغ المقبولة هي XLSX وXLS فقط." }, { status: 400 });
  try {
    return NextResponse.json(
      await saveAndInspectMergeFile(Buffer.from(await file.arrayBuffer()), file.name),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر فحص الملف." },
      { status: 422 },
    );
  }
}
