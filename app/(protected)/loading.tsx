import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <div className="space-y-6" aria-label="جارٍ التحميل"><Skeleton className="h-48 w-full" /><div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div></div>;
}
