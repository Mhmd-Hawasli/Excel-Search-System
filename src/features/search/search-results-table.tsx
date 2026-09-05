"use client";

import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Highlight } from "@/features/search/highlight";
import type { SearchResultRow } from "@/lib/search/query";
import { STANDARD_FIELD_LABELS } from "@/lib/excel/standard-field-catalog";
import { formatFunctionalCategory } from "@/lib/format/functional-category";
import { formatNationalId } from "@/lib/format/national-id";
import { formatShamCash } from "@/lib/format/sham-cash";

/**
 * Presentational results table. Lives on the client only for row-level
 * navigation (click / Enter / Space); data and highlighting arrive fully
 * rendered from the server component above it, including the sortable
 * `<thead>` (passed as an RSC element).
 */
export function SearchResultsTable({
  rows,
  query,
  header,
}: {
  rows: SearchResultRow[];
  query: string;
  header: React.ReactNode;
}) {
  const router = useRouter();

  function openRecord(recordId: string) {
    router.push(`/records/${recordId}`);
  }

  function matchedDisplayValue(row: SearchResultRow) {
    if (row.matchedField === "sham_cash") return formatShamCash(row.matchedValue) || "—";
    if (row.matchedField === "functional_category") return formatFunctionalCategory(row.matchedValue) || "—";
    return row.matchedValue || "—";
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[1450px] text-sm">
        <thead className="bg-muted/70">
          <tr>
            {header}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              tabIndex={0}
              role="link"
              aria-label={`فتح سجل ${row.sfFullName || row.dNationalId || row.id}`}
              className="cursor-pointer border-t transition hover:bg-muted/50 focus:bg-muted focus:outline-none"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a")) return;
                openRecord(row.id);
              }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openRecord(row.id);
                }
              }}
            >
              <td className="p-3 align-top">
                <p className="font-bold">{row.groupName}</p>
                <p className="text-xs text-muted-foreground">{row.fileName}</p>
              </td>
              <td className="p-3 align-top">{row.sfFullName || "—"}</td>
              <td className="p-3 align-top">
                <span className="ltr-numbers">{formatNationalId(row.dNationalId) || "—"}</span>
              </td>
              <td className="p-3 align-top">{row.sfMotherName || "—"}</td>
              <td className="p-3 align-top">
                <span className="ltr-numbers">{formatShamCash(row.sfShamCash) || "—"}</span>
              </td>
              <td className="p-3 align-top">
                <span className="ltr-numbers">{row.sfPersonalNo || "—"}</span>
              </td>
              <td className="p-3 align-top">{row.sfJobTitle || "—"}</td>
              <td className="p-3 align-top">{formatFunctionalCategory(row.sfFunctionalCategory) || "—"}</td>
              <td className="p-3 align-top">{row.sfOrganizationalLevel || "—"}</td>
              <td className="p-3 align-top">
                <div className="min-w-40 space-y-1">
                  {row.matchedField ? <Badge variant="secondary">{STANDARD_FIELD_LABELS[row.matchedField]}</Badge> : null}
                  <p className="text-sm">
                    <Highlight value={matchedDisplayValue(row)} query={query} field={row.matchedField} />
                  </p>
                </div>
              </td>
              <td className="p-3 align-top">
                <Button asChild variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-primary">
                  <a
                    href={`/records/${row.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="فتح في علامة تبويب جديدة"
                    aria-label={`فتح ${row.sfFullName || "السجل"} في علامة تبويب جديدة`}
                    onClick={(event) => event.stopPropagation()}
                    onAuxClick={(event) => event.stopPropagation()}
                  >
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
