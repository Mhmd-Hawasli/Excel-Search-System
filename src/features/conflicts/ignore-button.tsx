"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff } from "lucide-react";
import { toast } from "sonner";

/**
 * Dismisses one (rule, record) problem: it disappears from the report,
 * statistics and exports until the record itself is deleted.
 */
export function IgnoreButton({ recordId, rule }: { recordId: string; rule: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function ignore() {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/conflicts/ignore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rule, recordId }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(result?.error ?? "تعذر تجاهل المشكلة.");
        return;
      }
      toast.success("تم تجاهل المشكلة ولن تظهر مجدداً.");
      router.refresh();
    } catch {
      toast.error("تعذر تجاهل المشكلة. تحقق من الاتصال.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void ignore()}
      className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
      title="تجاهل هذه المشكلة لهذا السجل"
    >
      <EyeOff className="size-3" aria-hidden="true" />
      {pending ? "جارٍ التجاهل…" : "تجاهل"}
    </button>
  );
}
