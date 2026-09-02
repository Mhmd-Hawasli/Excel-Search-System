"use client";

import * as React from "react";
import { toast } from "sonner";
import type { MutationResult } from "@/lib/actions/result";
import { cn } from "@/lib/cn";

type MutationFormProps = Omit<React.ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (formData: FormData) => Promise<MutationResult>;
  pendingMessage?: string;
  resetOnSuccess?: boolean;
};

export function MutationForm({
  action,
  pendingMessage = "جارٍ الحفظ…",
  resetOnSuccess = false,
  className,
  children,
  ...props
}: MutationFormProps) {
  const [pending, startTransition] = React.useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const toastId = toast.loading(pendingMessage);
      try {
        const result = await action(formData);
        if (!result.ok) {
          toast.error(result.error, { id: toastId });
          return;
        }
        if (resetOnSuccess) form.reset();
        toast.success(result.message, { id: toastId });
      } catch {
        toast.error("تعذر حفظ التغيير. تحقق من الاتصال ثم حاول مجددًا.", { id: toastId });
      }
    });
  }

  return (
    <form
      {...props}
      onSubmit={submit}
      aria-busy={pending}
      className={cn("transition-opacity aria-busy:pointer-events-none aria-busy:opacity-65", className)}
    >
      {children}
    </form>
  );
}
