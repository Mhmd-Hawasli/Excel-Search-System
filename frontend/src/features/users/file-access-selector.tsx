"use client";

import {
  selectedPermissionFiles,
  withPermissionFiles,
  type FilePermissionRow,
  type PermissionGroup,
} from "@/lib/users/file-permissions";

export function FileAccessSelector({ idPrefix, assignments, groups, onChange }: {
  idPrefix: string;
  assignments: FilePermissionRow[];
  groups: PermissionGroup[];
  onChange: (rows: FilePermissionRow[]) => void;
}) {
  const selected = selectedPermissionFiles(assignments, groups);
  const files = groups.flatMap((group) => group.files);
  const allSelected = files.length > 0 && files.every((file) => selected.has(file.id));

  function toggleFiles(ids: string[], checked: boolean) {
    const next = new Set(selected);
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    onChange(withPermissionFiles(assignments, next));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        الصلاحية للملفات المحددة: اختيار المجموعة يحدد كل ملفاتها، وتبقى المجموعة معلّمة ما دام أحد ملفاتها محدداً.
      </p>
      <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-bold ${allSelected ? "border-primary/40 bg-primary/5 text-primary" : "bg-background"}`}>
        <input type="checkbox" checked={allSelected} disabled={files.length === 0}
          onChange={(event) => toggleFiles(files.map((file) => file.id), event.target.checked)}
          className="size-4 accent-primary" />
        إظهار والبحث في جميع الملفات الحالية
      </label>
      {groups.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد مجموعات بعد.</p> : null}
      <div className="max-h-96 space-y-3 overflow-y-auto">
        {groups.map((group) => {
          const selectedCount = group.files.filter((file) => selected.has(file.id)).length;
          const checked = selectedCount > 0;
          return (
            <fieldset key={group.id} className="rounded-lg border p-3">
              <legend className="px-1">
                <label className={`flex cursor-pointer items-center gap-2 text-sm font-bold ${checked ? "text-primary" : ""}`}>
                  <input id={`${idPrefix}-group-${group.id}`} type="checkbox" checked={checked}
                    disabled={group.files.length === 0}
                    onChange={(event) => toggleFiles(group.files.map((file) => file.id), event.target.checked)}
                    className="size-4 accent-primary" />
                  {group.name}
                  <span className="text-xs font-normal text-muted-foreground">({selectedCount}/{group.files.length})</span>
                </label>
              </legend>
              {group.files.length === 0 ? <p className="text-xs text-muted-foreground">لا توجد ملفات في هذه المجموعة.</p> : null}
              <div className="grid gap-2 sm:grid-cols-2">
                {group.files.map((file) => (
                  <label key={file.id} className={`flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm ${selected.has(file.id) ? "border-primary/30 bg-primary/5 text-primary" : "bg-background"}`}>
                    <input id={`${idPrefix}-file-${file.id}`} type="checkbox" checked={selected.has(file.id)}
                      onChange={(event) => toggleFiles([file.id], event.target.checked)}
                      className="size-4 shrink-0 accent-primary" />
                    {file.name}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
