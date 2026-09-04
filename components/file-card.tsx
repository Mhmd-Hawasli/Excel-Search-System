import Link from "next/link";
import { ChevronLeft, FileSpreadsheet, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUploadDateTime } from "@/lib/format/date";

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
}: FileCardProps) {
  return (
    <Link href={href} className="block group">
      <Card className="transition hover:border-primary/50 hover:shadow-soft hover:bg-primary/5">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition">
                <FileSpreadsheet className="size-4" />
              </span>
              <span className="truncate">{name}</span>
            </CardTitle>
            <CardDescription className="mt-2 line-clamp-1">
              {description || originalFilename}
            </CardDescription>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {showGroup && groupName ? (
                <>
                  <span className="font-medium text-foreground">{groupName}</span>
                  <span>·</span>
                </>
              ) : null}
              <span>{rowCount.toLocaleString("en-US")} سجل</span>
              <span>·</span>
              <span>{columnCount} عمود</span>
              <span>·</span>
              <span className="ltr-numbers">{formatUploadDateTime(uploadedAt)}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hasEdits ? (
              <Badge
                variant="outline"
                className="border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
              >
                <PencilLine className="size-3" />
                معدّل
              </Badge>
            ) : null}
            <Badge variant="secondary">الإصدار {version}</Badge>
            <ChevronLeft className="size-4 text-muted-foreground group-hover:text-primary" />
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}
