"use client";

import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * شاشة التحميل الموحدة لكل المشروع: مؤشر دوّار في منتصف الشاشة مع رسالة.
 * تُستخدم لكل حالات التحميل على مستوى الصفحة بدل الهياكل الرمادية
 * المتفرقة، لتوحيد تجربة الانتظار.
 */
export function LoadingScreen({
  message = "جارٍ التحميل…",
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message}
      className={cn(
        "flex min-h-64 flex-col items-center justify-center gap-3 py-16 text-center",
        className,
      )}
    >
      <LoaderCircle className="size-10 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm font-semibold text-muted-foreground">{message}</p>
    </div>
  );
}
