import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-1">
        {eyebrow ? <p className="text-xs font-bold text-primary">{eyebrow}</p> : null}
        <h1 className="text-2xl font-bold">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </header>
  );
}
