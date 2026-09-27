"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { apiFetchBinary } from "@/services/api-client";
import { useExportLock } from "@/lib/export-lock";
import { Button, type ButtonProps } from "@/components/ui/button";

/** Shared download control for archive exports. While the file is being
 * prepared and downloaded the button itself shows a spinner; no separate
 * progress bar is rendered. */
export function ExportButton({ href, label, fallbackFilename = "export.xlsx", variant = "outline", size = "default" }: {
  href: string;
  label: string;
  fallbackFilename?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const [busy, setBusy] = useState(false);
  const { blocked, tryAcquire, release } = useExportLock();

  async function download() {
    if (busy) return;
    // تصدير واحد فقط في المرة على مستوى المستخدم.
    if (!tryAcquire()) {
      toast.info("يوجد تصدير جارٍ — انتظر انتهاءه ثم أعد المحاولة.");
      return;
    }
    setBusy(true);
    try {
      const { blob, filename } = await apiFetchBinary(href, {});
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename ?? fallbackFilename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      toast.success("اكتمل تصدير الملف.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تصدير الملف.");
    } finally {
      setBusy(false);
      release();
    }
  }

  const disabled = busy || blocked;
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={disabled}
      title={blocked && !busy ? "يوجد تصدير جارٍ — انتظر انتهاءه" : undefined}
      onClick={() => void download()}
    >
      {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
      {busy ? "جارٍ تصدير الملف…" : label}
    </Button>
  );
}
