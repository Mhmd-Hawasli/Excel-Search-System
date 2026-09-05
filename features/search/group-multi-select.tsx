"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Multi-select dropdown for narrowing the search scope to specific groups.
 * An empty selection means "all groups" (compact URL: no `groupId` params).
 */
export function GroupMultiSelect({
  groups,
  value,
  onChange,
}: {
  groups: { id: string; name: string }[];
  value: string[];
  onChange: (groupIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const allGroupIds = groups.map((group) => group.id);
  const allSelected = groups.length === 0 || value.length === groups.length;
  const selectedNames = groups.filter((group) => value.includes(group.id)).map((group) => group.name);
  const label = allSelected ? "جميع الملفات" : `${selectedNames.length} مجموعة`;

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function toggleGroup(groupId: string) {
    const next = value.includes(groupId) ? value.filter((id) => id !== groupId) : [...value, groupId];
    onChange(next);
  }

  function option(selected: boolean, text: string) {
    return (
      <>
        <span
          className={`flex size-5 shrink-0 items-center justify-center rounded border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"}`}
        >
          {selected ? <Check className="size-3.5" /> : null}
        </span>
        <span className="truncate">{text}</span>
      </>
    );
  }

  return (
    <div ref={containerRef} className="relative min-w-0 sm:min-w-56">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full justify-between px-3 font-normal"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open ? (
        <div
          role="listbox"
          aria-label="مصدر البيانات"
          aria-multiselectable="true"
          className="absolute start-0 top-full z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-card p-1 text-card-foreground shadow-lg sm:min-w-64"
        >
          <div className="mb-1 border-b border-border pb-1">
            <button
              type="button"
              role="option"
              aria-selected={allSelected}
              className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-right text-sm font-semibold hover:bg-accent hover:text-accent-foreground"
              onClick={() => onChange(allSelected ? [] : allGroupIds)}
            >
              {option(allSelected, "جميع الملفات")}
            </button>
          </div>
          {groups.map((group) => {
            const selected = value.includes(group.id);
            return (
              <button
                key={group.id}
                type="button"
                role="option"
                aria-selected={selected}
                className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-right text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => toggleGroup(group.id)}
              >
                {option(selected, group.name)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
