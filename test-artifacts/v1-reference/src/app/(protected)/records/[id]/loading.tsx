import { Skeleton } from "@/components/ui/skeleton";
export default function RecordLoading() { return <div className="space-y-5"><Skeleton className="h-44" /><Skeleton className="h-16 w-2/3" /><div className="grid gap-3 md:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div><Skeleton className="h-40" /></div>; }
