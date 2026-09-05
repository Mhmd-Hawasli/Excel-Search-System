import { CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

export function FlashMessage({ error, success }: { error?: string; success?: string }) {
  const message = error ?? success;
  if (!message) return null;
  const Icon = error ? TriangleAlert : CircleCheck;
  return <div role={error ? "alert" : "status"} className={cn("flex items-center gap-2 rounded-lg border p-3 text-sm font-semibold", error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-primary/25 bg-primary/10 text-primary")}><Icon className="size-4 shrink-0" />{message}</div>;
}
