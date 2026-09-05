import Link from "next/link";
import { ChevronLeft, FileSpreadsheet, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatUploadDateTime } from "@/lib/format/date";
import { cn } from "@/lib/cn";

type FileCardProps = {
  href: string;
  name: string;
  description: string | null;
  originalFilename: string;
  rowCount: number;
  columnCount: number;
  version: number;
  uploadedAt: Date;
  groupName?: string;
  showGroup?: boolean;
  hasEdits?: boolean;
  compact?: boolean;
};

export function FileCard({
  href,
  name,
  description,
  originalFilename,
  rowCount,
  columnCount,
  version,
  uploadedAt,
  groupName,
  showGroup = false,
  hasEdits = false,
  compact = false,
}: FileCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group",
        compact
          ? "recent-file-row"
          : "flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5 shadow-soft transition hover:border-primary/30 hover:bg-accent/30",
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/10 bg-primary/5 text-primary transition group-hover:bg-primary/10">
        <FileSpreadsheet className="size-5" strokeWidth={1.7} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-bold group-hover:text-primary" title={name}>
            {name}
          </h3>
          {hasEdits && (
            <Badge
              variant="outline"
              className="gap-1 border-amber-500/25 bg-amber-500/10 px-1.5 text-amber-700 dark:text-amber-300"
            >
              <PencilLine className="size-3" />
              معدّل
            </Badge>
          )}
        </div>
        <p
          className="mt-1 truncate text-xs leading-6 text-muted-foreground"
          title={description || originalFilename}
        >
          {description || originalFilename}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {showGroup && groupName && (
            <>
              <span className="font-medium text-primary">{groupName}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>{rowCount.toLocaleString("en-US")} سجل</span>
          <span aria-hidden="true">·</span>
          <span>{columnCount} عمود</span>
          {!compact && (
            <>
              <span aria-hidden="true">·</span>
              <time className="ltr-numbers" dateTime={uploadedAt.toISOString()}>
                {formatUploadDateTime(uploadedAt)}
              </time>
            </>
          )}
        </div>
      </div>
      <div
        className={cn(
          "flex shrink-0 items-center gap-3",
          compact && "max-sm:w-full max-sm:justify-end",
        )}
      >
        <div className="space-y-2 text-end">
          <Badge variant="secondary" className="px-2 font-medium">
            الإصدار {version}
          </Badge>
          {compact && (
            <time
              className="block text-[12px] text-muted-foreground ltr-numbers"
              dateTime={uploadedAt.toISOString()}
            >
              {formatUploadDateTime(uploadedAt)}
            </time>
          )}
        </div>
        <ChevronLeft
          className="size-4 shrink-0 text-muted-foreground/60 group-hover:text-primary"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}
