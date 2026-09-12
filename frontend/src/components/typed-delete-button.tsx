"use client";

import { useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation, type HttpMutation } from "@/lib/mutation";

/**
 * Destructive action button with a typed-confirmation dialog. Delegates the
 * action invocation to the shared `useMutation` flow.
 */
export function TypedDeleteButton({
  id,
  entityName,
  description,
  action,
  onSuccess,
}: {
  id: string;
  entityName: string;
  description: string;
  action: HttpMutation;
  /** V2 addition: refresh the list after deletion (replaces revalidatePath). */
  onSuccess?: () => void;
}) {
  const { pending, run } = useMutation();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    run(action, formData, {
      pendingMessage: "جارٍ تنفيذ الحذف…",
      fallbackError: "تعذر تنفيذ الحذف. حاول مرة أخرى.",
      onSuccess: () => {
        setOpen(false);
        setConfirmation("");
        onSuccess?.();
      },
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setConfirmation(""); }}>
      <AlertDialogTrigger asChild><Button variant="destructive" size="sm"><Trash2 className="size-4" />حذف</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>تأكيد الحذف النهائي</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <div className="space-y-2"><Label htmlFor={`confirm-${id}`}>اكتب «{entityName}» للتأكيد</Label><Input id={`confirm-${id}`} name="confirmName" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></div>
          <AlertDialogFooter><AlertDialogCancel type="button" disabled={pending}>إلغاء</AlertDialogCancel><Button type="submit" variant="destructive" disabled={confirmation !== entityName || pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}حذف نهائي</Button></AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
