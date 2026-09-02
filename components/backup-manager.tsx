"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseBackup, LoaderCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BackupManager() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  async function restore() {
    if (!file || confirmation !== "استعادة") return;
    setBusy(true);
    const toastId = toast.loading("جارٍ استعادة النسخة الاحتياطية…");
    try {
      const body = new FormData(); body.set("file", file); body.set("confirmation", confirmation);
      const response = await fetch("/api/backup/restore", { method: "POST", body });
      const result = await response.json() as { error?: string; summary?: { groups: number; files: number; records: number } };
      if (!response.ok) return void toast.error(result.error ?? "تعذر استعادة النسخة.", { id: toastId });
      toast.success(`تمت الاستعادة: ${result.summary?.files ?? 0} ملف و${result.summary?.records ?? 0} سجل.`, { id: toastId });
      setFile(null); setConfirmation("");
      router.replace("/");
    } catch {
      toast.error("تعذر استعادة النسخة. تحقق من الاتصال ثم حاول مجددًا.", { id: toastId });
    } finally {
      setBusy(false);
    }
  }
  return <div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><DatabaseBackup className="size-5 text-primary" />تنزيل نسخة كاملة</CardTitle><CardDescription>ملف JSON واحد يحتوي المجموعات والفئات والملفات والأعمدة والسجلات وتقارير الجودة والقوالب وسجل النشاط.</CardDescription></CardHeader><CardContent><Button asChild size="lg"><a href="/api/backup/export" download>تنزيل النسخة الاحتياطية</a></Button></CardContent></Card><Card className="border-destructive/35"><CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><RotateCcw className="size-5" />استعادة نسخة</CardTitle><CardDescription>تحذف الاستعادة كل البيانات الحالية نهائيًا ثم تضع محتوى النسخة المختارة مكانها. احتفظ بنسخة حديثة قبل المتابعة.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label htmlFor="backup-file">ملف النسخة الاحتياطية</Label><Input id="backup-file" type="file" accept=".json,application/json" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div><div className="space-y-2"><Label htmlFor="restore-confirmation">اكتب «استعادة» للتأكيد</Label><Input id="restore-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></div><Button type="button" variant="destructive" onClick={() => void restore()} disabled={!file || confirmation !== "استعادة" || busy}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}حذف الحالي واستعادة النسخة</Button></CardContent></Card></div>;
}
