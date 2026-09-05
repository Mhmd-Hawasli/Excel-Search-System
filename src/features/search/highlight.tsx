import type { StandardFieldKey } from "@/lib/excel/types";
import { computeHighlightRanges } from "@/utils/highlight";

/**
 * Renders a value with the query matches wrapped in `<mark>`. Purely
 * derived from props, so it renders on the server inside result tables.
 */
export function Highlight({ value, query, field }: { value: string; query: string; field: StandardFieldKey | null }) {
  const ranges = computeHighlightRanges(value, query, field);
  if (!ranges.length) return <>{value}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) parts.push(value.slice(cursor, range.start));
    parts.push(
      <mark key={`${range.start}-${range.end}`} className="rounded bg-amber-200 px-0.5 text-amber-950 dark:bg-amber-400/30 dark:text-amber-100">
        {value.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return <>{parts}</>;
}
