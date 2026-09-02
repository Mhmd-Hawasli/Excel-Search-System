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
import {
  moveColumnToCategory,
  reorderCategoryColumnGroups,
} from "@/lib/actions/categories";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MutationForm } from "@/components/mutation-form";

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

function SortableColumnGroup({
  group,
  categoryKey,
  categoryOptions,
  disabled,
}: {
  group: CategoryBoardGroup;
  categoryKey: string;
  categoryOptions: CategoryOption[];
  disabled: boolean;
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
          {disabled ? <LoaderCircle className="size-5 animate-spin" /> : <GripVertical className="size-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-black">{group.label}</h4>
            {group.standardFieldLabel ? <Badge>حقل قياسي موحّد</Badge> : <Badge variant="outline">عمود مستقل</Badge>}
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
          <div key={column.id} className="grid gap-3 border-b p-3 last:border-b-0 md:grid-cols-[1fr_1fr_auto] md:items-center">
            <div>
              <p className="font-bold">{column.headerRaw}</p>
              <p className="mt-1 text-xs text-muted-foreground">عمود Excel رقم {column.columnIndex}</p>
            </div>
            <div>
              <p className="font-semibold">{column.fileName}</p>
              <p className="mt-1 text-xs text-muted-foreground">{column.groupName}</p>
            </div>
            <MutationForm action={moveColumnToCategory} pendingMessage="جارٍ نقل العمود…" className="flex items-center gap-2">
              <input type="hidden" name="columnId" value={column.id} />
              <input type="hidden" name="openCategory" value={categoryKey} />
              <select
                name="categoryId"
                defaultValue={categoryKey}
                aria-label={`فئة العمود ${column.headerRaw}`}
                className="h-9 min-w-40 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {categoryOptions.map((option) => (
                  <option key={option.id ?? "other"} value={option.id ?? "other"}>
                    {option.name}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" variant="secondary">
                <FolderInput className="size-4" />
                نقل
              </Button>
            </MutationForm>
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
}: {
  categoryId: string | null;
  groups: CategoryBoardGroup[];
  categoryOptions: CategoryOption[];
}) {
  const [groups, setGroups] = React.useState(initialGroups);
  const [saving, startSaving] = React.useTransition();
  React.useEffect(() => {
    setGroups(initialGroups);
  }, [initialGroups]);
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
      const result = await reorderCategoryColumnGroups(categoryId, next.map((group) => group.key));
      if (!result.ok) {
        setGroups(previous);
        toast.error(result.error);
        return;
      }
      toast.success("تم حفظ ترتيب الأعمدة.");
    });
  }

  if (groups.length === 0) {
    return <div className="p-8 text-center text-sm text-muted-foreground">لا توجد أعمدة مرتبطة بهذه الفئة.</div>;
  }

  return (
    <div className="space-y-3 p-4">
      <p className="text-sm text-muted-foreground">
        اسحب أي بند من المقبض لتغيير موضعه. الحقول القياسية الموحّدة تتحرك بكل أعمدتها دفعة واحدة.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={groups.map((group) => group.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {groups.map((group) => (
              <SortableColumnGroup
                key={group.key}
                group={group}
                categoryKey={categoryId ?? "other"}
                categoryOptions={categoryOptions}
                disabled={saving}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
