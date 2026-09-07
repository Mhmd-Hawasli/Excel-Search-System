import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold">الصفحة غير موجودة</h1>
        <p className="text-muted-foreground">المورد الذي تبحث عنه غير متاح.</p>
        <Link href="/">
          <Button variant="outline">العودة للرئيسية</Button>
        </Link>
      </div>
    </main>
  );
}
