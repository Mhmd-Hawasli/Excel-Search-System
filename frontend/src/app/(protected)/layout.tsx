import type { ReactNode } from "react";
import { AuthGuard } from "@/features/auth/auth-guard";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
