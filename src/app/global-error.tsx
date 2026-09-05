"use client";

import { CircleAlert, RefreshCw } from "lucide-react";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="ar" dir="rtl"><body><main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "sans-serif", textAlign: "center" }}><div><CircleAlert style={{ margin: "0 auto", width: 48, height: 48, color: "#b42318" }} /><h1>تعذر تشغيل التطبيق</h1><p>حدث خطأ غير متوقع. أعد المحاولة، وإن استمر فتحقق من اتصال قاعدة البيانات.</p><button type="button" onClick={reset} style={{ border: 0, borderRadius: 8, padding: "10px 16px", cursor: "pointer" }}><RefreshCw style={{ width: 16, verticalAlign: "middle", marginLeft: 8 }} />إعادة المحاولة</button></div></main></body></html>;
}
