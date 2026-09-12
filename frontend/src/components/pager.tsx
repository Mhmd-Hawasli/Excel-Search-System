export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <button className="rounded border px-3 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>السابق</button>
      <span className="text-muted-foreground">صفحة {page} من {totalPages} — {total} نتيجة</span>
      <button className="rounded border px-3 py-1 disabled:opacity-40" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>التالي</button>
    </div>
  );
}
