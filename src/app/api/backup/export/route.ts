import { exportBackup } from "@/lib/backup/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(await exportBackup()), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="excel-archive-backup-${date}.json"`, "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "تعذر إنشاء النسخة الاحتياطية. تحقق من اتصال قاعدة البيانات." }, { status: 500 });
  }
}
