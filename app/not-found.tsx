import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center p-6 text-center"><div className="max-w-md space-y-4"><SearchX className="mx-auto size-12 text-muted-foreground" /><h1 className="text-3xl font-black">الصفحة غير موجودة</h1><p className="text-muted-foreground">ربما تغيّر الرابط أو حُذف العنصر الذي تحاول فتحه.</p><Button asChild><Link href="/">العودة إلى الرئيسية</Link></Button></div></main>;
}
