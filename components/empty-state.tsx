import { Inbox } from "lucide-react";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="grid min-h-64 place-items-center rounded-xl border border-dashed bg-muted/25 p-8 text-center"><div className="max-w-md space-y-3"><span className="mx-auto grid size-12 place-items-center rounded-full bg-muted"><Inbox className="size-5 text-muted-foreground" /></span><h2 className="text-lg font-bold">{title}</h2><p className="text-sm leading-6 text-muted-foreground">{description}</p>{action ? <div className="pt-2">{action}</div> : null}</div></div>;
}
