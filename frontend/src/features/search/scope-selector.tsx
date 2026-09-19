"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { groupsService } from "@/services/groups.service";
import { cn } from "@/lib/cn";

interface ScopeGroup {
  id: string;
  name: string;
  files: { id: string; name: string }[];
}

/** Tri-state checkbox value: "partial" renders the indeterminate dash. */
type CheckState = "checked" | "partial" | "unchecked";

/**
 * Shared archive-scope picker (groups/files, repeated groupId/fileId params):
 * empty selection means all authorized files. Used by full, custom and bulk
 * search alike.
 */
export function ScopeSelector({
  groupIds,
  fileIds,
  onChange,
}: {
  groupIds: string[];
  fileIds: string[];
  onChange: (next: { groupIds: string[]; fileIds: string[] }) => void;
}) {
  const [groups, setGroups] = useState<ScopeGroup[]>([]);
  const [filesByGroup, setFilesByGroup] = useState<Record<string, { id: string; name: string }[]>>({});
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    groupsService
      .list()
      .then((list) => {
        if (active) setGroups(list.map((g) => ({ id: g.id, name: g.name, files: [] })));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open ]);

  // Keep every group's file list loaded while the picker is open, so checkbox
  // states, partial states and the summary always reflect the effective scope
  // (checked ⇔ included in the search) — even for collapsed groups.
  useEffect(() => {
    if (!open || groups.length === 0) return;
    const missing = groups.filter((g) => filesByGroup[g.id] === undefined);
    if (missing.length === 0) return;
    let active = true;
    void Promise.allSettled(missing.map((g) => groupsService.get(g.id))).then((results) => {
      if (!active) return;
      const loaded: Record<string, { id: string; name: string }[]> = {};
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          loaded[missing[index].id] = result.value.files.map((f) => ({ id: f.id, name: f.name }));
        }
      });
      if (Object.keys(loaded).length === 0) return;
      setFilesByGroup((current) => ({ ...current, ...loaded }));
      setGroups((current) =>
        current.map((g) => (loaded[g.id] ? { ...g, files: loaded[g.id] } : g)),
      );
    });
    return () => {
      active = false;
    };
  }, [open, groups, filesByGroup]);

  async function expand(groupId: string) {
    setExpanded((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId],
    );
    if (filesByGroup[groupId]) return;
    try {
      const detail = await groupsService.get(groupId);
      setFilesByGroup((current) => ({
        ...current,
        [groupId]: detail.files.map((f) => ({ id: f.id, name: f.name })),
      }));
      setGroups((current) =>
        current.map((g) =>
          g.id === groupId
            ? { ...g, files: detail.files.map((f) => ({ id: f.id, name: f.name })) }
            : g,
        ),
      );
    } catch {
      // Keep the group row; files stay unavailable.
    }
  }

  const allSelected = groupIds.length === 0 && fileIds.length === 0;
  const selectedGroups = groups.filter((g) => groupIds.includes(g.id));
  const selectedGroupCount = selectedGroups.length;
  const selectedFileCount = fileIds.length;

  // Known effective file total when only whole groups are selected, so the
  // summary states how many files will actually be searched. A group counts
  // as known once its file list has been loaded (see the preload effect).
  const knownTotalFiles = (() => {
    if (selectedFileCount > 0) return null;
    let total = 0;
    for (const group of selectedGroups) {
      const files = filesByGroup[group.id];
      if (files === undefined) return null;
      total += files.length;
    }
    return total;
  })();

  const fmtGroups = (n: number) => (n === 1 ? "مجموعة واحدة" : n === 2 ? "مجموعتان" : `${n} مجموعات`);
  const fmtFiles = (n: number) => (n === 1 ? "ملف واحد" : n === 2 ? "ملفان" : `${n} ملفات`);
  const fmtSelectedFiles = (n: number) =>
    n === 1 ? "ملف واحد محدد" : n === 2 ? "ملفان محددان" : `${n} ملفات محددة`;
  // Summary rule: never render a zero counter ("2 مجموعة و0 ملف").
  // Whole-group selection implies all of its files, so state the effective
  // file total whenever it is known.
  const label = allSelected
    ? "جميع الملفات"
    : selectedGroupCount === 1 && selectedFileCount === 0
      ? `${selectedGroups[0].name}: جميع الملفات`
      : selectedFileCount === 0
        ? knownTotalFiles !== null && knownTotalFiles > 0
          ? `${fmtGroups(selectedGroupCount)} — ${fmtFiles(knownTotalFiles)}`
          : `${fmtGroups(selectedGroupCount)} — جميع ملفاتها`
        : selectedGroupCount === 0
          ? fmtSelectedFiles(selectedFileCount)
          : `${fmtGroups(selectedGroupCount)} و ${fmtSelectedFiles(selectedFileCount)}`;

  const topState: CheckState = allSelected ? "checked" : "partial";

  function isFullCoverage(nextGroupIds: string[], nextFileIds: string[]): boolean {
    if (groups.length === 0) return false;
    if (nextFileIds.length === 0 && nextGroupIds.length === groups.length) return true;
    // File-level full coverage: every group is either fully included via
    // groupIds or all of its known files are included. Unknown file lists
    // (never expanded) mean we cannot prove full coverage — keep explicit.
    for (const group of groups) {
      if (nextGroupIds.includes(group.id)) continue;
      const files = filesByGroup[group.id] ?? group.files;
      if (files.length === 0) return false;
      if (!files.every((f) => nextFileIds.includes(f.id))) return false;
    }
    return true;
  }

  function toggleGroup(group: ScopeGroup) {
    // Default state (empty selection = everything checked): clicking a
    // checked group excludes just that group and keeps the rest checked.
    if (allSelected) {
      const others = groups.filter((g) => g.id !== group.id).map((g) => g.id);
      if (others.length === 0) return; // must keep at least one scope
      onChange({ groupIds: others, fileIds: [] });
      return;
    }
    const files = filesByGroup[group.id] ?? group.files;
    const selected =
      groupIds.includes(group.id) || (files.length > 0 && files.every((f) => fileIds.includes(f.id)));
    if (selected) {
      const nextGroupIds = groupIds.filter((id) => id !== group.id);
      const nextFileIds = fileIds.filter((id) => !files.some((f) => f.id === id));
      if (nextGroupIds.length === 0 && nextFileIds.length === 0) return; // block "none" (empty means all)
      onChange({ groupIds: nextGroupIds, fileIds: nextFileIds });
      return;
    }
    const nextGroupIds = [...groupIds, group.id];
    const nextFileIds = fileIds.filter((id) => !files.some((f) => f.id === id));
    if (isFullCoverage(nextGroupIds, nextFileIds)) {
      onChange({ groupIds: [], fileIds: [] });
      return;
    }
    onChange({ groupIds: nextGroupIds, fileIds: nextFileIds });
  }

  function toggleFile(groupId: string, fileId: string) {
    // Default state (empty selection = everything checked): clicking a
    // checked file excludes just that file and keeps everything else checked.
    if (allSelected) {
      const group = groups.find((g) => g.id === groupId);
      const files = filesByGroup[groupId] ?? group?.files ?? [];
      const otherGroupIds = groups.filter((g) => g.id !== groupId).map((g) => g.id);
      const otherFileIds = files.filter((f) => f.id !== fileId).map((f) => f.id);
      if (otherGroupIds.length === 0 && otherFileIds.length === 0) return; // must keep at least one scope
      onChange({ groupIds: otherGroupIds, fileIds: otherFileIds });
      return;
    }
    const files = filesByGroup[groupId] ?? groups.find((g) => g.id === groupId)?.files ?? [];
    // The group itself is fully selected: unchecking one of its files must
    // expand the group into "all its other files" instead of collapsing the
    // whole scope down to just the clicked file.
    if (groupIds.includes(groupId)) {
      if (files.length === 0) return; // file list unknown — wait for expand to load it
      const baseFileIds = fileIds.filter((id) => !files.some((f) => f.id === id));
      const otherFileIds = files.filter((f) => f.id !== fileId).map((f) => f.id);
      const nextGroupIds = groupIds.filter((id) => id !== groupId);
      const nextFileIds = [...baseFileIds, ...otherFileIds.filter((id) => !baseFileIds.includes(id))];
      if (nextGroupIds.length === 0 && nextFileIds.length === 0) return; // block "none"
      onChange({ groupIds: nextGroupIds, fileIds: nextFileIds });
      return;
    }
    const selected = fileIds.includes(fileId);
    if (selected) {
      const nextFileIds = fileIds.filter((id) => id !== fileId);
      if (groupIds.length === 0 && nextFileIds.length === 0) return; // block "none"
      onChange({ groupIds, fileIds: nextFileIds });
      return;
    }
    const nextFileIds = [...fileIds, fileId];
    if (isFullCoverage(groupIds, nextFileIds)) {
      onChange({ groupIds: [], fileIds: [] });
      return;
    }
    onChange({
      groupIds: groupIds.filter((id) => id !== groupId),
      fileIds: nextFileIds,
    });
  }

  function option(state: CheckState, text: string) {
    return (
      <>
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded border",
            state !== "unchecked"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-background",
          )}
        >
          {state === "checked" ? (
            <Check className="size-3.5" />
          ) : state === "partial" ? (
            <Minus className="size-3.5" />
          ) : null}
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
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </Button>
      {open ? (
        <div
          role="listbox"
          aria-label="تخصيص نطاق البحث"
          aria-multiselectable="true"
          className="absolute end-0 top-full z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border bg-white p-1 text-card-foreground shadow-lg sm:min-w-80"
        >
          <button
            type="button"
            role="option"
            aria-selected={allSelected}
            className="mb-1 flex w-full items-center gap-2 rounded-sm border-b px-3 py-2 text-right text-sm font-semibold hover:bg-accent"
            onClick={() => onChange({ groupIds: [], fileIds: [] })}
          >
            {option(topState, "جميع المجموعات والملفات")}
          </button>
          {groups.map((group) => {
            const files = filesByGroup[group.id] ?? group.files;
            const groupChecked =
              allSelected ||
              groupIds.includes(group.id) ||
              (files.length > 0 && files.every((f) => fileIds.includes(f.id)));
            // Best practice: a group with only some files selected renders an
            // indeterminate dash instead of a misleading unchecked box.
            const groupPartial =
              !groupChecked && files.length > 0 && files.some((f) => fileIds.includes(f.id));
            const groupState: CheckState = groupChecked ? "checked" : groupPartial ? "partial" : "unchecked";
            const isExpanded = expanded.includes(group.id);
            return (
              <div key={group.id} className="border-b last:border-b-0">
                <div className="flex items-center">
                  <button
                    type="button"
                    role="option"
                    aria-selected={groupChecked || groupPartial}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-sm px-3 py-2 text-right text-sm font-semibold hover:bg-accent",
                      (groupChecked || groupPartial) && "bg-primary/5",
                      groupChecked && "text-primary",
                    )}
                    onClick={() => toggleGroup(group)}
                  >
                    {option(groupState, `${group.name} — جميع الملفات`)}
                  </button>
                  <button
                    type="button"
                    className="p-2 text-muted-foreground hover:text-foreground"
                    aria-label={`${isExpanded ? "إخفاء" : "عرض"} ملفات ${group.name}`}
                    onClick={() => void expand(group.id)}
                  >
                    {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>
                </div>
                {isExpanded ? (
                  <div className="mb-1 ms-3 border-s ps-2">
                    {files.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">لا توجد ملفات محملة.</p>
                    ) : (
                      files.map((file) => {
                        const fileSelected =
                          allSelected || groupIds.includes(group.id) || fileIds.includes(file.id);
                        return (
                          <button
                            key={file.id}
                            type="button"
                            role="option"
                            aria-selected={fileSelected}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-sm px-3 py-2 text-right text-sm hover:bg-accent",
                              fileSelected && "text-primary",
                            )}
                            onClick={() => toggleFile(group.id, file.id)}
                          >
                            {option(fileSelected ? "checked" : "unchecked", file.name)}
                          </button>
                        );
                      })
                    )}
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
