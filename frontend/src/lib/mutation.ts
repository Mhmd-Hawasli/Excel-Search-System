"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/** Shared mutation result shape (mirrors V1 lib/actions/result.ts). */
export type MutationResult =
  | { ok: true; message: string; navigateTo?: string }
  | { ok: false; error: string };

/** An HTTP mutation accepting form data and returning the shared result shape. */
export type HttpMutation = (formData: FormData) => Promise<MutationResult>;

/** Options for `useMutation().run`. */
export type MutationOptions = {
  pendingMessage?: string;
  fallbackError?: string;
  onSuccess?: (result: Extract<MutationResult, { ok: true }>) => void;
};

/**
 * HTTP equivalent of V1's use-server-action flow: pending transition, a single
 * loading toast that upgrades to success/error, optional success callback, and
 * `navigateTo` routing. Server Actions become explicit backend HTTP operations.
 */
export function useMutation() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (mutate: HttpMutation, formData: FormData, options: MutationOptions = {}) => {
      const {
        pendingMessage = "جارٍ الحفظ…",
        fallbackError = "تعذر حفظ التغيير. تحقق من الاتصال ثم حاول مجددًا.",
        onSuccess,
      } = options;
      startTransition(async () => {
        const toastId = toast.loading(pendingMessage);
        try {
          const result = await mutate(formData);
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
