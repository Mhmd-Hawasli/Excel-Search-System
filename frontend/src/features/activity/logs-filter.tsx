"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";
import { ACTIVITY_LABELS, type ActivityAction } from "@/lib/activity";

/** All activity table filters; `action` is mirrored into the URL (?action=…). */
export interface LogsFilters {
  action: string;
  person: string;
  actor: string;
  query: string;
  dateFrom: string;
  dateTo: string;
}

interface SearchableOption {
  value: string;
  label: string;
}

/**
 * Dropdown with built-in search and a fixed-size scrollable list.
 * Replaces the native <select> so long option lists (e.g. targets) stay
 * usable: the panel keeps a fixed height (max-h-60 + overflow-y-auto) and
 * the search input filters options client-side.
 */
function SearchableSelect({
  id,
  value,
  onChange,
  options,
  allLabel,
  searchPlaceholder = "بحث في القائمة…",
  emptyText = "لا نتائج مطابقة",
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  options: SearchableOption[];
  allLabel: string;
  searchPlaceholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selectedLabel = options.find((option) => option.value === value)?.label ?? allLabel;

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return options;
    return options.filter(
      (option) => option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle),
    );
  }, [options, needle]);
  const showAll = !needle || allLabel.toLowerCase().includes(needle);
  const visible: SearchableOption[] = useMemo(
    () => (showAll ? [{ value: "", label: allLabel }, ...filtered] : filtered),
    [showAll, allLabel, filtered],
  );
  // Clamp the keyboard cursor without an effect: it may exceed the list
  // after the search query shrinks the visible options.
  const active = visible.length === 0 ? 0 : Math.min(activeIndex, visible.length - 1);

  function toggle() {
    if (!open) {
      // Fresh search on every open; focusing happens in the effect below.
      setQuery("");
      setActiveIndex(0);
    }
    setOpen((current) => !current);
  }

  // Focus the search field once the panel is mounted (DOM sync only).
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open ]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open ]);

  // Keep the active option scrolled into view during keyboard navigation.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  function onSearchKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, visible.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const current = visible[active];
      if (current) pick(current.value);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={toggle}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm",
          "transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          !value && "text-muted-foreground",
        )}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn("ml-2 size-4 shrink-0 opacity-50 transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-card text-card-foreground shadow-lg">
          <div className="border-b p-2">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 opacity-50" />
              <input
                ref={searchRef}
                type="search"
                role="searchbox"
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onSearchKeyDown}
                className="h-9 w-full rounded-md border border-input bg-background py-1 pl-3 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          <ul ref={listRef} id={listboxId} role="listbox" aria-labelledby={id} className="max-h-60 overflow-y-auto p-1">
            {visible.length === 0 ? (
              <li className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyText}</li>
            ) : (
              visible.map((option, index) => {
                const selected = option.value === value;
                const isActive = index === active;
                return (
                  <li
                    key={option.value || "__all__"}
                    role="option"
                    aria-selected={selected}
                    data-active={isActive}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <button
                      type="button"
                      onClick={() => pick(option.value)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-right text-sm transition",
                        isActive && "bg-accent text-accent-foreground",
                        selected ? "font-bold" : "font-normal",
                      )}
                    >
                      <span className="truncate">{option.label}</span>
                      {selected ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Activity table filter panel: free-text search, action type, person
 * (target only — actor names belong to the actor filter), and a date range — mirroring V1's URL-committed
 * action filter and extending it with client-side column filters.
 */
export function LogsFilter({
  filters,
  persons,
  actors,
  onChange,
  onReset,
}: {
  filters: LogsFilters;
  persons: string[];
  actors: string[];
  onChange: (next: Partial<LogsFilters>) => void;
  onReset: () => void;
}) {
  const hasFilters = Boolean(
    filters.action || filters.person || filters.actor || filters.query.trim() || filters.dateFrom || filters.dateTo,
  );
  const actionOptions: SearchableOption[] = useMemo(
    () =>
      (Object.keys(ACTIVITY_LABELS) as ActivityAction[]).map((key) => ({ value: key, label: ACTIVITY_LABELS[key] })),
    [],
  );
  const actorOptions: SearchableOption[] = useMemo(
    () => actors.map((actor) => ({ value: actor, label: actor })),
    [actors],
  );
  const personOptions: SearchableOption[] = useMemo(
    () => persons.map((person) => ({ value: person, label: person })),
    [persons],
  );
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {/* Row 1: search 3/4 + reset 1/4 */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2 md:col-span-3">
            <Label htmlFor="logs-query">بحث حر</Label>
            <Input
              id="logs-query"
              type="search"
              className="h-11"
              placeholder="اسم، مستخدم، ملف، تفاصيل…"
              value={filters.query}
              onChange={(event) => onChange({ query: event.target.value })}
            />
          </div>
          <div className="space-y-2 md:col-span-1">
            <Label className="max-md:hidden">&nbsp;</Label>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={onReset}
              disabled={!hasFilters}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              إعادة تعيين الفلتر
            </Button>
          </div>
        </div>
        {/* Row 2 order (RTL, right → left): نوع العملية - المعدل - الهدف - من تاريخ - إلى تاريخ */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div className="space-y-2">
            <Label htmlFor="logs-action">نوع العملية</Label>
            <SearchableSelect
              id="logs-action"
              value={filters.action}
              onChange={(action) => onChange({ action })}
              options={actionOptions}
              allLabel="جميع العمليات"
              searchPlaceholder="بحث في العمليات…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logs-actor">المعدل</Label>
            <SearchableSelect
              id="logs-actor"
              value={filters.actor}
              onChange={(actor) => onChange({ actor })}
              options={actorOptions}
              allLabel="جميع المُعدِّلين"
              searchPlaceholder="بحث في المُعدِّلين…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logs-person">الهدف</Label>
            <SearchableSelect
              id="logs-person"
              value={filters.person}
              onChange={(person) => onChange({ person })}
              options={personOptions}
              allLabel="جميع الأهداف"
              searchPlaceholder="بحث في الأهداف…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logs-date-from">من تاريخ</Label>
            <Input
              id="logs-date-from"
              type="date"
              className="h-11"
              value={filters.dateFrom}
              onChange={(event) => onChange({ dateFrom: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logs-date-to">إلى تاريخ</Label>
            <Input
              id="logs-date-to"
              type="date"
              className="h-11"
              value={filters.dateTo}
              onChange={(event) => onChange({ dateTo: event.target.value })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
