import { restoreBackup } from "@/lib/backup/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const confirmation = formData.get("confirmation");
  if (confirmation !== "استعادة") return Response.json({ error: "اكتب كلمة «استعادة» لتأكيد حذف البيانات الحالية." }, { status: 400 });
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".json")) return Response.json({ error: "اختر ملف نسخة احتياطية بصيغة JSON." }, { status: 400 });
  if (file.size > 250 * 1024 * 1024) return Response.json({ error: "حجم ملف النسخة يتجاوز 250 ميغابايت." }, { status: 413 });
  try { return Response.json({ ok: true, summary: await restoreBackup(JSON.parse(await file.text()) as unknown) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "تعذر استعادة النسخة الاحتياطية." }, { status: 422 }); }
}
