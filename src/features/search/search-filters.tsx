"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { StandardFieldKey } from "@/lib/excel/types";
import { SEARCH_FIELDS } from "@/lib/search/fields";
import type { SearchMode } from "@/lib/search/plan";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GroupMultiSelect } from "@/features/search/group-multi-select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useParamNavigation } from "@/hooks/use-param-navigation";

/**
 * Idle delay before a settled query is pushed to the URL: typing never
 * searches, only a pause does — and only the results table below re-renders.
 */
const QUERY_IDLE_MS = 2000;

/**
 * Client filter panel for the search page. Owns only the text-input draft;
 * every other control writes straight to the URL and the server re-renders
 * the results — no client-side fetching, aborting, or loading state.
 *
 * The draft is intentionally decoupled from the server `query` prop: while
 * the user is typing, late navigation responses must never overwrite the
 * input (that is what used to eat the last typed character). Our own
 * navigation echo is ignored; only an external URL change (back/forward,
 * other controls) is adopted into the box.
 */
export function SearchFilters({
  pathname,
  params,
  groups,
  query,
  mode,
  field,
  groupIds,
  fileIds,
}: {
  pathname: string;
  params: URLSearchParams;
  groups: { id: string; name: string; files: { id: string; name: string }[] }[];
  query: string;
  mode: SearchMode;
  field: StandardFieldKey | null;
  groupIds: string[];
  fileIds: string[];
}) {
  const { setParams, isPending } = useParamNavigation(pathname, params);
  const [draft, setDraft] = useState(query);
  const debouncedDraft = useDebouncedValue(draft.trim(), QUERY_IDLE_MS);
  // Every `q` value this input pushed to the URL (or adopted from it).
  // Lets the sync below tell our own navigation echo apart from an external
  // URL change (back/forward): an echo carries no new information and must
  // never rewrite the input, while an external change is adopted so the box
  // always shows the results. State (not a ref) so the render-phase sync
  // below stays within the rules of hooks.
  const [lastPushed, setLastPushed] = useState(query);
  // Latest committed query for the push effect below. Read via ref so the
  // effect only ever reacts to a *settled draft* — never to an incoming
  // `query` change (e.g. right after adopting an external navigation, the
  // debounce value still lags one step behind and must not be pushed back).
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  // Back/forward navigation: re-sync the draft when the URL query changes
  // from somewhere other than this input (previous-render comparison).
  // While the user is typing ahead of the last server response, the incoming
  // value is a stale echo of an earlier keystroke — adopting it is exactly
  // what used to delete freshly typed characters.
  const [previousQuery, setPreviousQuery] = useState(query);
  if (query !== previousQuery) {
    setPreviousQuery(query);
    if (query !== lastPushed) {
      setLastPushed(query);
      setDraft(query);
    }
  }

  // Push the settled draft to the URL once it diverges from the URL. Keyed
  // on the debounced value alone (current URL read via ref): adopting an
  // external navigation must never echo the still-lagging debounce back.
  // setParams is stable (memoized on pathname + stable router instance).
  useEffect(() => {
    if (debouncedDraft !== queryRef.current) {
      setLastPushed(debouncedDraft);
      setParams({ q: debouncedDraft });
    }
  }, [debouncedDraft, setParams]);

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
            {isPending ? (
              <Loader2
                className="absolute left-3 top-3.5 size-4 animate-spin text-primary"
                aria-hidden="true"
              />
            ) : (
              <Search
                className="absolute left-3 top-3.5 size-4 text-muted-foreground"
                aria-hidden="true"
              />
            )}
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
            groupIds={groupIds}
            fileIds={fileIds}
            onChange={({ groupIds: nextGroupIds, fileIds: nextFileIds }) =>
              setParams({
                groupId:
                  nextGroupIds.length === groups.length && nextFileIds.length === 0
                    ? []
                    : nextGroupIds,
                fileId: nextFileIds,
                page: 1,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
