"use client";

import { CircleAlert, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="grid min-h-[55vh] place-items-center text-center"><div className="max-w-md space-y-4"><CircleAlert className="mx-auto size-12 text-destructive" /><h1 className="text-2xl font-bold">تعذر فتح هذه الصفحة</h1><p className="text-muted-foreground">حدث خطأ غير متوقع. لم تُفقد بياناتك، ويمكنك إعادة المحاولة.</p><Button onClick={reset}><RefreshCcw className="size-4" />إعادة المحاولة</Button></div></div>;
}
