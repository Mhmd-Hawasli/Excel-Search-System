import { redirect } from "next/navigation";
import { Archive, LockKeyhole } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (next?.startsWith("//")) redirect("/login");
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_right,hsl(var(--accent)),transparent_34%)] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mb-2 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><Archive className="size-7" /></span>
          <CardTitle className="text-2xl">مرحبًا بك في أرشيف الإكسل</CardTitle>
          <CardDescription>أدخل بيانات المسؤول للوصول إلى ملفات الأرشيف والبحث.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-5 flex items-center gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground"><LockKeyhole className="size-4 shrink-0" />هذه البيانات متاحة للمسؤول المصرح له فقط.</div>
          <LoginForm nextPath={next} />
        </CardContent>
      </Card>
    </main>
  );
}
