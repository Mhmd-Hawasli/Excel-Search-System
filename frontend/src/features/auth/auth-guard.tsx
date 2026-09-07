"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authService } from "@/services/auth.service";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    authService.me()
      .then((user) => {
        if (!user) router.replace("/login");
        else setChecked(true);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  return checked ? <>{children}</> : <div className="p-8 text-sm text-muted-foreground">جارٍ التحقق من الجلسة…</div>;
}
