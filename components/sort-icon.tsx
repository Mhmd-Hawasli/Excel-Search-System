import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

/** Tri-state sort indicator shared by the server-rendered sortable tables. */
export function SortIcon({ active, dir, className = "size-3.5" }: { active: boolean; dir: "asc" | "desc"; className?: string }) {
  if (!active) return <ArrowUpDown className={`${className} opacity-40`} aria-hidden="true" />;
  return dir === "asc" ? (
    <ArrowUp className={`${className} text-primary`} aria-hidden="true" />
  ) : (
    <ArrowDown className={`${className} text-primary`} aria-hidden="true" />
  );
}
