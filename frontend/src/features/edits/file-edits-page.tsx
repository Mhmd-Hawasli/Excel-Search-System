"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { formatIsoDateTime } from "@/lib/format/date";
import { editsService, type EditedFileSummary } from "@/services/edits.service";
import { EditHistorySection } from "./edit-history-section";

/**
 * صفحة سجل تعديلات داخلية خاصة بملف واحد (/edits/[fileId]).
 * تُفتح من زر "عرض السجل" في ملخص الملفات أو "عرض سجل التعديلات" في تفاصيل الملف.
 */
export function FileEditsPage({ fileId, initialVersion }: { fileId: string; initialVersion?: number }) {
  const [file, setFile] = useState<EditedFileSummary | null>(null);
  const [loadingFile, setLoadingFile] = useState(true);

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
          file ? (
            <>
              {file.groupName} • {file.editCount} تعديل • آخر تعديل{" "}
              <time className="ltr-numbers" dateTime={file.lastEditAt}>
                {formatIsoDateTime(file.lastEditAt)}
              </time>
            </>
          ) : (
            "راجع تعديلات هذا الملف، فلتر حسب أي عمود، وتراجع عن أي تعديل مباشرة."
          )
        }
        actions={
          file ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/groups/${file.groupId}/files/${file.fileId}`}>عرض الملف</Link>
            </Button>
          ) : undefined
        }
      />

      <EditHistorySection fileId={fileId} currentVersion={file?.currentVersion} initialVersion={initialVersion} />
    </div>
  );
}
