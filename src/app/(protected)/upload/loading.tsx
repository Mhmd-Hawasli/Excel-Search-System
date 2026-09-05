import { Skeleton } from "@/components/ui/skeleton";
export default function UploadLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-20 w-2/3" />
      <div className="grid grid-cols-5 gap-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
