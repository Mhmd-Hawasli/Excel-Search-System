"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { useApiQuery } from "@/hooks/use-api-query";
import { hasPermission } from "@/lib/permissions";
import { authService } from "@/services/auth.service";
import { editsService, type EditedFileSummary } from "@/services/edits.service";
import { EditHistorySection } from "./edit-history-section";

/**
 * صفحة سجل تعديلات داخلية خاصة بملف واحد (/edits/[fileId]).
 * تُفتح من زر "عرض السجل" في ملخص الملفات أو "عرض سجل التعديلات" في تفاصيل الملف.
 */
export function FileEditsPage({ fileId, initialVersion }: { fileId: string; initialVersion?: number }) {
  const { data: user } = useApiQuery(() => authService.me(), []);
  const [file, setFile] = useState<EditedFileSummary | null>(null);
  const [loadingFile, setLoadingFile] = useState(true);
  const [markEdits, setMarkEdits] = useState(false);

  const permissions = user?.permissions ?? [];
  const canExport = hasPermission(permissions, "export.run");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const summary = await editsService.summary();
        if (!active) return;
        setFile(summary.files.find((f) => f.fileId === fileId) ?? null);
      } catch {
        if (active) setFile(null);
      } finally {
        if (active) setLoadingFile(false);
      }
    })();
    return () => { active = false; };
  }, [fileId]);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/edits">
          <ArrowRight className="size-4" />
          العودة إلى ملخص الملفات
        </Link>
      </Button>

      <PageHeader
        eyebrow="سجل التعديلات"
        title={loadingFile ? "…" : (file?.fileName ?? "سجل الملف")}
        description={
          file
            ? `${file.groupName} • ${file.editCount} تعديل • آخر تعديل ${file.lastEditAt}`
            : "راجع تعديلات هذا الملف، فلتر حسب أي عمود، وتراجع عن أي تعديل مباشرة."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {file ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/groups/${file.groupId}/files/${file.fileId}`}>عرض الملف</Link>
              </Button>
            ) : null}
            {canExport ? (
              <>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted/50">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={markEdits}
                    onChange={(e) => setMarkEdits(e.target.checked)}
                  />
                  تعليم القيم التي تم تعديلها
                </label>
                <Button asChild variant="outline" size="sm">
                  <a href={editsService.exportUrl(fileId, markEdits)}>
                    <Download className="size-4" />
                    تصدير الملف
                  </a>
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <EditHistorySection fileId={fileId} currentVersion={file?.currentVersion} initialVersion={initialVersion} />
    </div>
  );
}
