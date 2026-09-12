"use client";

import { useRouter } from "next/navigation";
import { SelectField } from "@/components/select-field";
import { ACTIVITY_LABELS } from "@/lib/activity";
import { ActivityAction } from "@/generated/prisma/client";

/**
 * Server-rendered activity table filter: a plain select that navigates to
 * `?action=…` (or drops it for all). No draft state — every change is a
 * committed navigation.
 */
export function LogsFilter({ action }: { action: string }) {
  const router = useRouter();
  return (
    <div className="max-w-xs">
      <SelectField
        id="logs-action"
        label="نوع العملية"
        value={action}
        onChange={(value) =>
          router.replace(value ? `/logs?action=${value}` : "/logs", { scroll: false })
        }
      >
        <option value="">جميع العمليات</option>
        {(Object.keys(ACTIVITY_LABELS) as ActivityAction[]).map((key) => (
          <option key={key} value={key}>
            {ACTIVITY_LABELS[key]}
          </option>
        ))}
      </SelectField>
    </div>
  );
}
