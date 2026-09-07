"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { apiFetch } from "@/services/api-client";

interface InspectResult {
  sheets?: Array<{ name: string; columns: string[]; rowCount: number }>;
  sheetName?: string;
}

export function UploadWizard() {
  const [file, setFile] = useState<File | null>(null);
  const [inspect, setInspect] = useState<InspectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function inspectFile() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      setInspect(await apiFetch<InspectResult>("/api/workbooks/inspect", { method: "POST", body: form }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر فحص الملف.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="رفع ملف" title="رفع ملف إكسل جديد" description="افحص المصنف واربط الأعمدة ثم ابدأ الاستيراد." />
      <Card>
        <CardContent className="space-y-4">
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button onClick={inspectFile} disabled={!file || loading}>{loading ? "جارٍ الفحص…" : "فحص الملف"}</Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {inspect ? (
            <div className="space-y-2">
              <p className="font-bold">{inspect.sheets?.length ?? 1} ورقة</p>
              {inspect.sheets?.map((sheet) => (
                <div key={sheet.name} className="rounded-lg border p-3">
                  <p className="font-semibold">{sheet.name}</p>
                  <p className="text-xs text-muted-foreground">{sheet.rowCount} صف • {sheet.columns.length} عمود</p>
                  <p className="text-xs text-muted-foreground">{sheet.columns.join("، ")}</p>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
