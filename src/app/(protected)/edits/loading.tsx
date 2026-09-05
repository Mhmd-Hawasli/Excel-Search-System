export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 rounded-lg bg-muted" />
      <div className="h-64 rounded-xl border bg-muted/40" />
      <div className="h-48 rounded-xl border bg-muted/40" />
    </div>
  );
}
