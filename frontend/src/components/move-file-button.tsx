"use client";

import { useState } from "react";
import { FolderInput, LoaderCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useApiQuery } from "@/hooks/use-api-query";
import { useMutation } from "@/lib/mutation";
import { filesService } from "@/services/files.service";
import { groupsService } from "@/services/groups.service";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

/**
 * "نقل إلى مجموعة" action: opens a dialog to pick the destination group, then
 * moves the file (records/edits/version stay intact). Uses the shared
 * `useMutation` flow; success routes to the destination group page.
 */
export function MoveFileButton({
  fileId,
  fileName,
  currentGroupId,
  variant = "outline",
  size = "sm",
  label = "نقل",
  ...triggerProps
}: {
  fileId: string;
  fileName: string;
  currentGroupId: string;
  label?: string;
} & Omit<ButtonProps, "children" | "asChild">) {
  const [open, setOpen] = useState(false);
  const [targetGroupId, setTargetGroupId] = useState("");
  const { pending, run } = useMutation();
  // Groups load only while the dialog is open; the fetcher short-circuits otherwise.
  const { data: groups } = useApiQuery(
    () => (open ? groupsService.list() : Promise.resolve([])),
    [open],
  );
  const options = (groups ?? []).filter((group) => group.id !== currentGroupId);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !targetGroupId) return;
    const formData = new FormData(event.currentTarget);
    run(filesService.move, formData, {
      pendingMessage: "جارٍ نقل الملف…",
      fallbackError: "تعذر نقل الملف. حاول مرة أخرى.",
      onSuccess: () => {
        setOpen(false);
        setTargetGroupId("");
      },
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setTargetGroupId("");
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} {...triggerProps}>
          <FolderInput className="size-4" />
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>نقل الملف إلى مجموعة أخرى</AlertDialogTitle>
          <AlertDialogDescription>
            سيُنقل «{fileName}» مع كل سجلاته وتعديلاته إلى المجموعة المحددة. لن يتغير اسم الملف أو بياناته.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <input type="hidden" name="id" value={fileId} />
          <div className="space-y-2">
            <Label htmlFor={`move-target-${fileId}`}>المجموعة الجديدة</Label>
            <select
              id={`move-target-${fileId}`}
              name="targetGroupId"
              className={selectClass}
              value={targetGroupId}
              onChange={(event) => setTargetGroupId(event.target.value)}
            >
              <option value="" disabled>
                {options.length ? "اختر المجموعة…" : "لا توجد مجموعة أخرى"}
              </option>
              {options.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              إلغاء
            </AlertDialogCancel>
            <Button type="submit" disabled={!targetGroupId || pending}>
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : <FolderInput className="size-4" />}
              نقل الملف
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
