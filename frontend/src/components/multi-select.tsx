"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface MultiSelectOption {
  value: string;
  label: string;
  hint?: string | null;
}

/**
 * اختيار من متعدد بقائمة منسدلة: مربعات اختيار + بحث + تحديد الكل/مسح.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  searchPlaceholder = "بحث…",
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open ]);

  const needle = query.trim();
  const visible = needle
    ? options.filter((o) => o.label.includes(needle) || o.value.includes(needle))
    : options;
  const selectedSet = new Set(selected);

  function toggle(value: string) {
    onChange(selectedSet.has(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const summary =
    selected.length === 0
      ? "الكل"
      : selected.length <= 2
        ? selected
            .map((v) => options.find((o) => o.value === v)?.label ?? v)
            .join("، ")
        : `${selected.length} محدد`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm",
          selected.length > 0 ? "border-primary font-semibold" : "text-muted-foreground",
        )}
      >
        <span className="truncate">
          {label}: {summary}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full min-w-52 rounded-lg border bg-card p-2 shadow-lg">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="mb-2 h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
          />
          <div className="mb-1 flex items-center justify-between text-xs">
            <button
              type="button"
              className="font-semibold text-primary hover:underline"
              onClick={() => onChange(options.map((o) => o.value))}
            >
              تحديد الكل
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:underline"
              onClick={() => onChange([])}
            >
              مسح
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">لا توجد نتائج.</p>
            ) : (
              visible.map((option) => {
                const checked = selectedSet.has(option.value);
                return (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={checked}
                      onChange={() => toggle(option.value)}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {option.label}
                      {option.hint ? (
                        <span className="ms-1 text-xs text-muted-foreground">({option.hint})</span>
                      ) : null}
                    </span>
                    {checked ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
