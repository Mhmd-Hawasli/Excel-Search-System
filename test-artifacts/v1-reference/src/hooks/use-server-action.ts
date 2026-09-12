"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { MutationResult } from "@/lib/actions/result";

/** Options for `useServerAction().run`. */
export type ServerActionOptions = {
  pendingMessage?: string;
  fallbackError?: string;
  onSuccess?: (result: Extract<MutationResult, { ok: true }>) => void;
};

/** A server action accepting form data and returning the shared result shape. */
export type ServerAction = (formData: FormData) => Promise<MutationResult>;

/**
 * Runs a `"use server"` action with the app's shared UX contract: pending
 * transition, a single loading toast that upgrades to success/error, optional
 * success callback, and `navigateTo` routing. Previously duplicated in
 * `MutationForm` and `TypedDeleteButton`.
 */
export function useServerAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (action: ServerAction, formData: FormData, options: ServerActionOptions = {}) => {
      const {
        pendingMessage = "جارٍ الحفظ…",
        fallbackError = "تعذر حفظ التغيير. تحقق من الاتصال ثم حاول مجددًا.",
        onSuccess,
      } = options;
      startTransition(async () => {
        const toastId = toast.loading(pendingMessage);
        try {
          const result = await action(formData);
          if (!result.ok) {
            toast.error(result.error, { id: toastId });
            return;
          }
          toast.success(result.message, { id: toastId });
          onSuccess?.(result);
          if (result.navigateTo) router.replace(result.navigateTo);
        } catch {
          toast.error(fallbackError, { id: toastId });
        }
      });
    },
    [router],
  );

  return { pending, run };
}
