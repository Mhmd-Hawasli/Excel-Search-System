"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { useMutation, type HttpMutation } from "@/lib/mutation";

type MutationFormProps = Omit<React.ComponentProps<"form">, "action" | "onSubmit"> & {
  action: HttpMutation;
  pendingMessage?: string;
  resetOnSuccess?: boolean;
  /** V2 addition: server Actions revalidated implicitly; HTTP needs an explicit refresh. */
  onSuccess?: () => void;
};

/**
 * Form wrapper for HTTP mutations: prevents double submission while pending
 * and reports the result through the shared toast flow.
 */
export function MutationForm({ action, pendingMessage, resetOnSuccess = false, onSuccess, className, children, ...props }: MutationFormProps) {
  const { pending, run } = useMutation();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    run(action, formData, {
      pendingMessage,
      onSuccess: () => {
        if (resetOnSuccess) form.reset();
        onSuccess?.();
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
