"use client";

import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/** Upload bytes are measurable; inspection starts only after all bytes arrive. */
export function UploadProgressStatus({ percent, processingLabel = "جارٍ فحص الملف على الخادم…", className }: {
  percent: number;
  processingLabel?: string;
  className?: string;
}) {
  const inspecting = percent >= 100;
  return (
    <div role="status" aria-live="polite" className={cn("space-y-2 text-sm text-muted-foreground", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          {inspecting ? processingLabel : "جارٍ رفع الملف…"}
        </span>
        {!inspecting ? <span className="font-bold text-foreground ltr-numbers">{percent}%</span> : null}
      </div>
      <progress className="block h-2 w-full accent-primary" max={100} value={inspecting ? undefined : percent} aria-label={inspecting ? processingLabel : "نسبة رفع الملف"} />
    </div>
  );
}
