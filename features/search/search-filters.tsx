"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { StandardFieldKey } from "@/lib/excel/types";
import { SEARCH_FIELDS } from "@/lib/search/fields";
import type { SearchMode } from "@/lib/search/plan";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GroupMultiSelect } from "@/features/search/group-multi-select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useParamNavigation } from "@/hooks/use-param-navigation";

/**
 * Client filter panel for the search page. Owns only the text-input draft;
 * every other control writes straight to the URL and the server re-renders
 * the results — no client-side fetching, aborting, or loading state.
 */
export function SearchFilters({
  pathname,
  params,
  groups,
  query,
  mode,
  field,
  groupIds,
}: {
  pathname: string;
  params: URLSearchParams;
  groups: { id: string; name: string }[];
  query: string;
  mode: SearchMode;
  field: StandardFieldKey | null;
  groupIds: string[];
}) {
  const { setParams } = useParamNavigation(pathname, params);
  const [draft, setDraft] = useState(query);
  const debouncedDraft = useDebouncedValue(draft.trim(), 350);

  // Back/forward navigation: re-sync the draft when the URL query changes
  // from somewhere other than this input (previous-render comparison).
  const [previousQuery, setPreviousQuery] = useState(query);
  if (query !== previousQuery) {
    setPreviousQuery(query);
    if (query !== draft.trim()) setDraft(query);
  }

  // Push the settled draft to the URL once it diverges from the URL.
  useEffect(() => {
    if (debouncedDraft !== query) setParams({ q: debouncedDraft });
  }, [debouncedDraft, query, setParams]);

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="space-y-4 p-5">
        <div className="flex rounded-lg bg-muted p-1">
          <button
            type="button"
            className={`flex-1 rounded-md px-4 py-2 text-sm font-bold ${mode === "full" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            aria-pressed={mode === "full"}
            onClick={() => setParams({ mode: "full", field: null })}
          >
            البحث الكامل
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md px-4 py-2 text-sm font-bold ${mode === "custom" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            aria-pressed={mode === "custom"}
            onClick={() => setParams({ mode: "custom", field: field ?? "full_name" })}
          >
            البحث المخصص
          </button>
        </div>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
            <Label htmlFor="search-query" className="sr-only">
              عبارة البحث
            </Label>
            <Input
              id="search-query"
              className="h-11 pe-10"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="اسم، رقم وطني، هاتف، فئة وظيفية، أو أي معرّف…"
              autoFocus
            />
          </div>
          {mode === "custom" ? (
            <div className="relative sm:min-w-56">
              <Label htmlFor="search-field" className="sr-only">
                حقل البحث
              </Label>
              <select
                id="search-field"
                aria-label="حقل البحث"
                className="h-11 w-full appearance-none rounded-md border border-input bg-background py-2 pe-9 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={field ?? "full_name"}
                onChange={(event) => setParams({ field: event.target.value })}
              >
                {SEARCH_FIELDS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <GroupMultiSelect
            groups={groups}
            value={groupIds}
            onChange={(next) => setParams({ groupId: next.length === groups.length ? [] : next })}
          />
        </div>
      </div>
    </div>
  );
}
