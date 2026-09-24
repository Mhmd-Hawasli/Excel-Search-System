"use client";

import { useState } from "react";
import { ChevronsUp } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/services/api-client";
import { filesService } from "@/services/files.service";
import { toast } from "sonner";

interface VersionBumpDialogProps {
  fileId: string;
  fileName: string;
  currentVersion: number;
  pendingEditCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function VersionBumpDialog({
  fileId,
  fileName,
  currentVersion,
  pendingEditCount,
  open,
  onOpenChange,
  onDone,
}: VersionBumpDialogProps) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = note.trim();
    if (trimmed.length < 2) {
      setError("اكتب رسالة الإصدار: ما التغيرات التي حصلت؟ (حرفان على الأقل).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await filesService.bumpVersion(fileId, trimmed);
      toast.success(`تم رفع الإصدار من ${result.previousVersion} إلى ${result.newVersion}.`);
      setNote("");
      onOpenChange(false);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذر رفع الإصدار. حاول مجددًا.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ChevronsUp className="size-5 text-primary" />
            رفع إصدار الملف
          </AlertDialogTitle>
          <AlertDialogDescription>
            سيرتفع إصدار «{fileName}» من <strong className="text-foreground">الإصدار {currentVersion}</strong> إلى{" "}
            <strong className="text-foreground">الإصدار {currentVersion + 1}</strong>.
            {pendingEditCount > 0 ? (
              <>
                {" "}لديك <strong className="text-foreground">{pendingEditCount} تعديل يدوي</strong> على الإصدار الحالي —
                ستُحفظ مؤرشفة ضمن الإصدار {currentVersion} ويبدأ الإصدار الجديد نظيفًا.
              </>
            ) : (
              " لا توجد تعديلات يدوية معلقة على الإصدار الحالي."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="version-note">رسالة الإصدار — ما التغيرات التي حصلت؟ *</Label>
          <Textarea
            id="version-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="مثال: اعتماد تصحيح الأسماء بعد مراجعة اللجنة…"
            rows={4}
            maxLength={2000}
          />
          {error ? (
            <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>تراجع</AlertDialogCancel>
          <Button onClick={submit} disabled={saving}>
            <ChevronsUp className="size-4" />
            {saving ? "جارٍ الرفع…" : `تأكيد الرفع إلى الإصدار ${currentVersion + 1}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
