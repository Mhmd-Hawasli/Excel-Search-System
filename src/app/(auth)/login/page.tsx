import { redirect } from "next/navigation";
import { Archive, LockKeyhole } from "lucide-react";
import { LoginForm } from "@/features/auth/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (next?.startsWith("//")) redirect("/login");
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center bg-background px-5 py-16">
      <div className="absolute left-5 top-5">
        <ThemeToggle />
      </div>
      <div className="mb-8 flex items-center gap-3">
        <span className="brand-mark">
          <Archive className="size-5" />
        </span>
        <span className="text-lg font-extrabold">أرشيف الإكسل</span>
      </div>
      <Card className="w-full max-w-[420px] rounded-2xl">
        <CardHeader className="space-y-3 px-7 pt-8">
          <p className="text-xs font-semibold text-primary">مساحة العمل</p>
          <CardTitle className="text-2xl font-extrabold">مرحبًا بعودتك</CardTitle>
          <CardDescription className="leading-7">
            سجّل الدخول للوصول إلى ملفاتك والبحث في الأرشيف.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-7 pb-8">
          <LoginForm nextPath={next} />
          <div className="mt-6 flex items-center justify-center gap-2 border-t pt-5 text-xs text-muted-foreground">
            <LockKeyhole className="size-3.5 shrink-0" />
            الدخول مخصص لمسؤول الأرشيف
          </div>
        </CardContent>
      </Card>
      <p className="mt-6 text-xs text-muted-foreground">إدارة البيانات والملفات</p>
    </main>
  );
}
