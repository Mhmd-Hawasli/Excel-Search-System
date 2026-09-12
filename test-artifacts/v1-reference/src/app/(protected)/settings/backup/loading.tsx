import { Skeleton } from "@/components/ui/skeleton";
export default function BackupLoading() { return <div className="space-y-5"><Skeleton className="h-20 w-2/3" /><div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-80" /></div></div>; }
