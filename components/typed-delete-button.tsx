"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { MutationResult } from "@/lib/actions/result";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TypedDeleteButton({ id, entityName, description, action }: { id: string; entityName: string; description: string; action: (formData: FormData) => Promise<MutationResult> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const toastId = toast.loading("جارٍ تنفيذ الحذف…");
      try {
        const result = await action(formData);
        if (!result.ok) return void toast.error(result.error, { id: toastId });
        toast.success(result.message, { id: toastId });
        setOpen(false);
        setConfirmation("");
        if (result.navigateTo) router.replace(result.navigateTo);
      } catch {
        toast.error("تعذر تنفيذ الحذف. حاول مرة أخرى.", { id: toastId });
      }
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
