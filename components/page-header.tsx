export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-heading flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div className="min-w-0 space-y-2">
        {eyebrow ? <p className="text-xs font-semibold text-primary">{eyebrow}</p> : null}
        <h1 className="text-2xl font-extrabold leading-normal tracking-tight lg:text-[28px]">
          {title}
        </h1>
        <p className="max-w-2xl text-sm leading-7 text-muted-foreground">{description}</p>
      </div>
      {actions ? (
        <div className="flex max-w-full flex-wrap gap-2 md:max-w-[60%]">{actions}</div>
      ) : null}
    </div>
  );
}
