"use client";

import { useState } from "react";
import { LoaderCircle, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "تعذر تسجيل الدخول. حاول مرة أخرى.");
      setPending(false);
      return;
    }
    window.location.assign(nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="username">اسم المستخدم</Label><Input id="username" name="username" autoComplete="username" required autoFocus /></div>
      <div className="space-y-2"><Label htmlFor="password">كلمة المرور</Label><Input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      {error ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</p> : null}
      <Button className="w-full" type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <LogIn className="size-4" />}{pending ? "جارٍ التحقق…" : "تسجيل الدخول"}
      </Button>
    </form>
  );
}
