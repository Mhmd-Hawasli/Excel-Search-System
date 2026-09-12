"use client";

import * as React from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FolderInput, GripVertical, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { categoriesService } from "@/services/categories.service";
import { ApiError } from "@/services/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type CategoryBoardColumn = {
  id: string;
  headerRaw: string;
  columnIndex: number;
  fileName: string;
  groupName: string;
};

export type CategoryBoardGroup = {
  key: string;
  label: string;
  standardFieldLabel: string | null;
  columns: CategoryBoardColumn[];
};

type CategoryOption = { id: string | null; name: string };

function MoveColumnForm({
  columnId,
  headerRaw,
  categoryKey,
  categoryOptions,
  onMoved,
}: {
  columnId: string;
  headerRaw: string;
  categoryKey: string;
  categoryOptions: CategoryOption[];
  onMoved: () => void;
}) {
  const [target, setTarget] = React.useState(categoryKey);
  const [busy, setBusy] = React.useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const result = await categoriesService.moveColumn(columnId, target === "other" ? null : target);
      toast.success(result.message);
      onMoved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "تعذر نقل العمود.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-center gap-2">
      <select
        value={target}
        onChange={(event) => setTarget(event.target.value)}
        aria-label={`فئة العمود ${headerRaw}`}
        className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring sm:min-w-40"
      >
        {categoryOptions.map((option) => (
          <option key={option.id ?? "other"} value={option.id ?? "other"}>
            {option.name}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="secondary" disabled={busy}>
        <FolderInput className="size-4" />
        نقل
      </Button>
    </form>
  );
}

function SortableColumnGroup({
  group,
  categoryKey,
  categoryOptions,
  disabled,
  onMoved,
}: {
  group: CategoryBoardGroup;
  categoryKey: string;
  categoryOptions: CategoryOption[];
  disabled: boolean;
  onMoved: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.key,
    disabled,
  });
  const files = new Set(group.columns.map((column) => column.fileName)).size;

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-xl border bg-background shadow-sm transition-shadow ${isDragging ? "relative z-20 opacity-80 shadow-xl ring-2 ring-primary" : ""}`}
    >
      <div className="flex items-start gap-3 p-4">
        <button
          type="button"
          className="mt-0.5 flex size-10 shrink-0 touch-none cursor-grab items-center justify-center rounded-lg border bg-muted text-muted-foreground transition hover:border-primary hover:text-primary active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`اسحب لتغيير ترتيب ${group.label}`}
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          {disabled ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            <GripVertical className="size-5" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-black">{group.label}</h4>
            {group.standardFieldLabel ? (
              <Badge>حقل قياسي موحّد</Badge>
            ) : (
              <Badge variant="outline">عمود مستقل</Badge>
            )}
            <Badge variant="secondary">{group.columns.length} عمود</Badge>
            <Badge variant="outline">{files} ملف</Badge>
          </div>
          {group.standardFieldLabel && group.columns.length > 1 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              جُمعت الأعمدة المرتبطة بحقل «{group.standardFieldLabel}» وتتحرك معًا كبند واحد.
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-t bg-muted/20">
        {group.columns.map((column) => (
          <div
            key={column.id}
            className="grid gap-3 border-b p-3 last:border-b-0 md:grid-cols-[1fr_1fr_auto] md:items-center"
          >
            <div>
              <p className="font-bold">{column.headerRaw}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                عمود Excel رقم {column.columnIndex}
              </p>
            </div>
            <div>
              <p className="font-semibold">{column.fileName}</p>
              <p className="mt-1 text-xs text-muted-foreground">{column.groupName}</p>
            </div>
            <MoveColumnForm
              columnId={column.id}
              headerRaw={column.headerRaw}
              categoryKey={categoryKey}
              categoryOptions={categoryOptions}
              onMoved={onMoved}
            />
          </div>
        ))}
      </div>
    </article>
  );
}

export function CategoryColumnBoard({
  categoryId,
  groups: initialGroups,
  categoryOptions,
  onChanged,
}: {
  categoryId: string | null;
  groups: CategoryBoardGroup[];
  categoryOptions: CategoryOption[];
  onChanged: () => void;
}) {
  const [groups, setGroups] = React.useState(initialGroups);
  const [saving, startSaving] = React.useTransition();
  // Sync from server props when a save/reorder round-trip lands (previous-render
  // comparison instead of an effect, per react-hooks guidance).
  const [previousInitial, setPreviousInitial] = React.useState(initialGroups);
  if (initialGroups !== previousInitial) {
    setPreviousInitial(initialGroups);
    setGroups(initialGroups);
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id || saving) return;
    const previous = groups;
    const oldIndex = groups.findIndex((group) => group.key === event.active.id);
    const newIndex = groups.findIndex((group) => group.key === event.over?.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(groups, oldIndex, newIndex);
    setGroups(next);
    startSaving(async () => {
      try {
        await categoriesService.reorderGroups(categoryId, next.map((group) => group.key));
        toast.success("تم حفظ ترتيب الأعمدة.");
        onChanged();
      } catch (err) {
        setGroups(previous);
        toast.error(err instanceof ApiError ? err.message : "تعذر حفظ ترتيب الأعمدة.");
      }
    });
  }

  if (groups.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        لا توجد أعمدة مرتبطة بهذه الفئة.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <p className="text-sm text-muted-foreground">
        اسحب أي بند من المقبض لتغيير موضعه. الحقول القياسية الموحّدة تتحرك بكل أعمدتها دفعة واحدة.
      </p>
      <DndContext
        id={`category-columns-${categoryId ?? "other"}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={groups.map((group) => group.key)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {groups.map((group) => (
              <SortableColumnGroup
                key={group.key}
                group={group}
                categoryKey={categoryId ?? "other"}
                categoryOptions={categoryOptions}
                disabled={saving}
                onMoved={onChanged}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
