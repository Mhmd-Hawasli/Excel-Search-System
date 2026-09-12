"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { matchesNormalizedText } from "@/lib/normalization";

export type FieldMappingOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

/**
 * Searchable replacement for the native per-row mapping `<select>` used by the
 * archive upload surfaces (upload wizard, file-update wizard, mapping-edit
 * wizard). Same value contract (`""` = unmapped, option values verbatim), so
 * caller reducers stay untouched. Adds an unlink button (one click resets to
 * unmapped) and a filter input over the option labels (Arabic-normalized).
 */
export function FieldMappingSelect({
  id,
  ariaLabel,
  value,
  options,
  disabled,
  onChange,
  searchLabel = "بحث في الخيارات",
  unmappedLabel = "غير مربوط",
}: {
  id?: string;
  ariaLabel: string;
  value: string;
  options: FieldMappingOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
  searchLabel?: string;
  unmappedLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();

  const current = options.find((option) => option.value === value) ?? null;
  const visible = useMemo(() => {
    const query = filter.trim();
    if (!query) return options;
    return options.filter((option) => matchesNormalizedText(query, option.label));
  }, [filter, options]);

  const isUnmapped = value === "";

  function openList() {
    if (disabled) return;
    setFilter("");
    setActive(0);
    setOpen(true);
  }

  function closeList(restoreFocus: boolean) {
    setOpen(false);
    setFilter("");
    if (restoreFocus) triggerRef.current?.focus();
  }

  function choose(next: string) {
    onChange(next);
    closeList(true);
  }

  // Outside-click and Escape close without changing the mapping.
  // The popover lives in a portal (outside rootRef) so both refs count as inside.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      closeList(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeList(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open ]);

  // The mapping tables sit inside overflow containers (e.g. overflow-x-auto),
  // which clip absolutely-positioned descendants. The popover is portalled to
  // document.body with fixed positioning, re-anchored to the trigger on
  // scroll/resize, and flipped upward when space below is tight. Positioning
  // writes straight to the popover node (no extra render pass, no flicker).
  function positionPopover() {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 4;
    const width = Math.min(rect.width, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 200 && rect.top > spaceBelow) {
      popover.style.top = "";
      popover.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    } else {
      popover.style.bottom = "";
      popover.style.top = `${rect.bottom + gap}px`;
    }
    popover.style.left = `${left}px`;
    popover.style.width = `${width}px`;
    popover.style.visibility = "visible";
  }
  useEffect(() => {
    if (!open) return;
    positionPopover();
    window.addEventListener("resize", positionPopover);
    document.addEventListener("scroll", positionPopover, true);
    return () => {
      window.removeEventListener("resize", positionPopover);
      document.removeEventListener("scroll", positionPopover, true);
    };
  }, [open ]);

  // Keep the keyboard-active option visible while arrowing through the list.
  useEffect(() => {
    if (!open) return;
    optionRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open ]);

  function move(delta: 1 | -1) {
    if (visible.length === 0) return;
    let next = active;
    for (let step = 0; step < visible.length; step += 1) {
      next = (next + delta + visible.length) % visible.length;
      if (!visible[next].disabled) break;
    }
    setActive(next);
  }

  return (
    <div ref={rootRef} className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <button
          ref={triggerRef}
          id={id}
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => (open ? closeList(false) : openList())}
          onKeyDown={(event) => {
            if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !open) {
              event.preventDefault();
              openList();
            }
          }}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={cn("min-w-0 flex-1 truncate text-right", current ? undefined : "text-muted-foreground")}>
            {current ? current.label : unmappedLabel}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
        {open
          ? createPortal(
              <div
                ref={popoverRef}
                style={{
                  position: "fixed",
                  maxWidth: "calc(100vw - 16px)",
                  zIndex: 50,
                  visibility: "hidden",
                }}
                className="overflow-hidden rounded-md border bg-card shadow-md"
              >
                <div className="border-b p-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      autoFocus
                      value={filter}
                      onChange={(event) => {
                        setFilter(event.target.value);
                        setActive(0);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          move(1);
                        } else if (event.key === "ArrowUp") {
                          event.preventDefault();
                          move(-1);
                        } else if (event.key === "Enter") {
                          event.preventDefault();
                          const target = visible[active];
                          if (target && !target.disabled) choose(target.value);
                        }
                      }}
                      role="combobox"
                      aria-label={searchLabel}
                      aria-expanded
                      aria-controls={listId}
                      aria-activedescendant={visible[active] ? `${listId}-${active}` : undefined}
                      placeholder={searchLabel}
                      className="pe-3 ps-8"
                    />
                  </div>
                </div>
                <ul
                  id={listId}
                  role="listbox"
                  aria-label={ariaLabel}
                  className="max-h-64 overflow-y-auto p-1"
                >
                  {visible.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-muted-foreground">لا نتائج مطابقة</li>
                  ) : (
                    visible.map((option, index) => {
                      const selected = option.value === value;
                      return (
                        <li key={option.value || "unmapped"} id={`${listId}-${index}`} role="option" aria-selected={selected}>
                          <button
                            ref={(node) => {
                              optionRefs.current[index] = node;
                            }}
                            type="button"
                            disabled={option.disabled}
                            onClick={() => choose(option.value)}
                            onMouseEnter={() => setActive(index)}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-right text-sm",
                              option.disabled
                                ? "cursor-not-allowed opacity-50"
                                : "hover:bg-accent hover:text-accent-foreground",
                              index === active && !option.disabled && "bg-accent text-accent-foreground",
                            )}
                          >
                            <span className="min-w-0 flex-1 truncate">{option.label}</span>
                            {selected ? <Check className="size-4 shrink-0" aria-hidden /> : null}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
                </div>,
              document.body,
            )
          : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="إلغاء الارتباط"
        title="إلغاء الارتباط"
        disabled={disabled || isUnmapped}
        onClick={() => choose("")}
        className="shrink-0"
      >
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
