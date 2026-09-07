import { Search } from "lucide-react";

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-6 text-center sm:p-12">
      <Search className="mx-auto size-10 text-muted-foreground" />
      <h2 className="mt-3 font-bold">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
