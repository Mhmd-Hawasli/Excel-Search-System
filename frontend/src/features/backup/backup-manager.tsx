"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseBackup, LoaderCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/export-button";
import { UploadProgressStatus } from "@/components/upload-progress-status";
import { FilePicker } from "@/components/file-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiUploadForm } from "@/services/api-client";

export function BackupManager({ canExport, canRestore }: { canExport: boolean; canRestore: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  async function restore() {
    if (!file || confirmation !== "استعادة") return;
    setBusy(true);
    setUploadProgress(0);
    const toastId = toast.loading("جارٍ استعادة النسخة الاحتياطية…");
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("confirmation", confirmation);
      const result = await apiUploadForm<{ summary?: { groups: number; files: number; records: number } }>(
        "/api/backup/restore", body, setUploadProgress);
      toast.success(`تمت الاستعادة: ${result.summary?.files ?? 0} ملف و${result.summary?.records ?? 0} سجل.`, { id: toastId });
      setFile(null); setConfirmation("");
      router.replace("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر استعادة النسخة.", { id: toastId });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {canExport ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><DatabaseBackup className="size-5 text-primary" />تنزيل نسخة كاملة</CardTitle>
            <CardDescription>ملف JSON واحد يحتوي المجموعات والفئات والملفات والأعمدة والسجلات وتقارير الجودة والقوالب وسجل النشاط.</CardDescription>
          </CardHeader>
          <CardContent>
            <ExportButton href="/api/backup/export" label="تنزيل النسخة الاحتياطية" fallbackFilename="backup.json" size="lg" variant="default" />
          </CardContent>
        </Card>
      ) : null}
      {canRestore ? (
        <Card className="border-destructive/35">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive"><RotateCcw className="size-5" />استعادة نسخة</CardTitle>
            <CardDescription>تحذف الاستعادة كل البيانات الحالية نهائيًا ثم تضع محتوى النسخة المختارة مكانها. احتفظ بنسخة حديثة قبل المتابعة.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="backup-file">ملف النسخة الاحتياطية</Label>
              <FilePicker id="backup-file" accept=".json,application/json" disabled={busy} fileName={file?.name}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="restore-confirmation">اكتب «استعادة» للتأكيد</Label>
              <Input id="restore-confirmation" value={confirmation} disabled={busy}
                onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
            </div>
            <Button type="button" variant="destructive" onClick={() => void restore()}
              disabled={!file || confirmation !== "استعادة" || busy}>
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              حذف الحالي واستعادة النسخة
            </Button>
            {busy ? <UploadProgressStatus percent={uploadProgress} processingLabel="جارٍ استعادة البيانات…" /> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
