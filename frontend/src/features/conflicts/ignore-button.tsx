"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff } from "lucide-react";
import { toast } from "sonner";
import { conflictsService } from "@/services/conflicts.service";

/**
 * Dismisses one (rule, record) problem: it disappears from the report,
 * statistics and exports until the record itself is deleted.
 */
export function IgnoreButton({
  recordId,
  rule,
  onDone,
}: {
  recordId: string;
  rule: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function ignore() {
    if (pending) return;
    setPending(true);
    try {
      await conflictsService.ignore(rule, recordId);
      toast.success("تم تجاهل المشكلة ولن تظهر مجدداً.");
      if (onDone) onDone();
      else router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تجاهل المشكلة.");
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
