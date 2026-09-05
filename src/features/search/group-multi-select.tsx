"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

type Group = { id: string; name: string; files: { id: string; name: string }[] };
type Scope = { groupIds: string[]; fileIds: string[] };

/** Select whole groups or one or more individual files inside a group. */
export function GroupMultiSelect({
  groups,
  groupIds,
  fileIds,
  onChange,
}: {
  groups: Group[];
  groupIds: string[];
  fileIds: string[];
  onChange: (scope: Scope) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const allSelected = groupIds.length === 0 && fileIds.length === 0;
  const selectedFiles = groups
    .flatMap((group) => group.files)
    .filter((file) => fileIds.includes(file.id));
  const selectedGroups = groups.filter((group) => groupIds.includes(group.id));
  const label = allSelected
    ? "جميع الملفات"
    : selectedGroups.length === 1 && selectedFiles.length === 0
      ? `${selectedGroups[0].name}: جميع الملفات`
      : `${selectedGroups.length > 0 ? `${selectedGroups.length} مجموعة و` : ""}${selectedFiles.length} ملف محدد`;

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

  function toggleGroup(group: Group) {
    const selected =
      groupIds.includes(group.id) ||
      (group.files.length > 0 && group.files.every((file) => fileIds.includes(file.id)));
    onChange({
      groupIds: selected ? groupIds.filter((id) => id !== group.id) : [...groupIds, group.id],
      fileIds: fileIds.filter((id) => !group.files.some((file) => file.id === id)),
    });
  }
  function toggleFile(group: Group, fileId: string) {
    const selected = fileIds.includes(fileId);
    onChange({
      groupIds: groupIds.filter((id) => id !== group.id),
      fileIds: selected ? fileIds.filter((id) => id !== fileId) : [...fileIds, fileId],
    });
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
    <div ref={containerRef} className="relative min-w-0 sm:min-w-64">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full justify-between px-3 font-normal"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Button>
      {open ? (
        <div
          role="listbox"
          aria-label="تخصيص نطاق البحث"
          aria-multiselectable="true"
          className="absolute start-0 top-full z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border bg-card p-1 text-card-foreground shadow-lg sm:min-w-80"
        >
          <button
            type="button"
            role="option"
            aria-selected={allSelected}
            className="mb-1 flex w-full items-center gap-2 rounded-sm border-b px-3 py-2 text-right text-sm font-semibold hover:bg-accent"
            onClick={() => onChange({ groupIds: [], fileIds: [] })}
          >
            {option(allSelected, "جميع المجموعات والملفات")}
          </button>
          {groups.map((group) => {
            const groupSelected =
              groupIds.includes(group.id) ||
              (group.files.length > 0 && group.files.every((file) => fileIds.includes(file.id)));
            const isExpanded = expanded.includes(group.id);
            return (
              <div key={group.id} className="border-b last:border-b-0">
                <div className="flex items-center">
                  <button
                    type="button"
                    role="option"
                    aria-selected={groupSelected}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-sm px-3 py-2 text-right text-sm font-semibold hover:bg-accent ${groupSelected ? "bg-primary/5 text-primary" : ""}`}
                    onClick={() => toggleGroup(group)}
                  >
                    {option(groupSelected, `${group.name} — جميع الملفات`)}
                  </button>
                  <button
                    type="button"
                    className="p-2 text-muted-foreground hover:text-foreground"
                    aria-label={`${isExpanded ? "إخفاء" : "عرض"} ملفات ${group.name}`}
                    onClick={() =>
                      setExpanded((current) =>
                        current.includes(group.id)
                          ? current.filter((id) => id !== group.id)
                          : [...current, group.id],
                      )
                    }
                  >
                    {isExpanded ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </button>
                </div>
                {isExpanded ? (
                  <div className="mb-1 ms-3 border-s ps-2">
                    {group.files.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        role="option"
                        aria-selected={fileIds.includes(file.id)}
                        className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-right text-sm hover:bg-accent"
                        onClick={() => toggleFile(group, file.id)}
                      >
                        {option(fileIds.includes(file.id), file.name)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
