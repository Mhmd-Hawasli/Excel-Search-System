"use client";

import { Label } from "@/components/ui/label";
import { ACTIVITY_LABELS, type ActivityAction } from "@/lib/activity";

/**
 * Activity table filter: a plain select committing straight to the URL
 * (?action=…, dropped for all), mirroring V1's server-rendered LogsFilter.
 */
export function LogsFilter({ action, onChange }: { action: string; onChange: (next: string) => void }) {
  return (
    <div className="max-w-xs space-y-2">
      <Label htmlFor="logs-action">نوع العملية</Label>
      <select
        id="logs-action"
        className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={action}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">جميع العمليات</option>
        {(Object.keys(ACTIVITY_LABELS) as ActivityAction[]).map((key) => (
          <option key={key} value={key}>
            {ACTIVITY_LABELS[key]}
          </option>
        ))}
      </select>
    </div>
  );
}
