import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildQueryPath } from "@/utils/query-params";

/**
 * Server-rendered prev/next pager for URL-driven lists. Renders `Link`s (with
 * prefetching) instead of buttons; pages outside the valid range are plain
 * disabled buttons so they stay non-interactive.
 */
export function Pager({
  pathname,
  current,
  page,
  pageCount,
}: {
  pathname: string;
  current: URLSearchParams;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
      {page > 1 ? (
        <Button variant="outline" asChild>
          <Link href={buildQueryPath(pathname, current, { page: page - 1 })} scroll={false} prefetch>
            <ChevronRight className="size-4" aria-hidden="true" />
            السابق
          </Link>
        </Button>
      ) : (
        <Button variant="outline" disabled>
          <ChevronRight className="size-4" aria-hidden="true" />
          السابق
        </Button>
      )}
      <span className="text-sm text-muted-foreground">
        الصفحة {page} من {pageCount}
      </span>
      {page < pageCount ? (
        <Button variant="outline" asChild>
          <Link href={buildQueryPath(pathname, current, { page: page + 1 })} scroll={false} prefetch>
            التالي
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" disabled>
          التالي
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
