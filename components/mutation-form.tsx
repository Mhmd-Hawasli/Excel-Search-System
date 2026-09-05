"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { useServerAction, type ServerAction } from "@/hooks/use-server-action";

type MutationFormProps = Omit<React.ComponentProps<"form">, "action" | "onSubmit"> & {
  action: ServerAction;
  pendingMessage?: string;
  resetOnSuccess?: boolean;
};

/**
 * Form wrapper for server actions: prevents double submission while pending
 * and reports the result through the shared toast flow.
 */
export function MutationForm({ action, pendingMessage, resetOnSuccess = false, className, children, ...props }: MutationFormProps) {
  const { pending, run } = useServerAction();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    run(action, formData, {
      pendingMessage,
      onSuccess: () => {
        if (resetOnSuccess) form.reset();
      },
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
