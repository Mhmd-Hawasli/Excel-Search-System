import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function RecordNotFound() { return <div className="grid min-h-[55vh] place-items-center text-center"><div className="space-y-3"><h1 className="text-2xl font-bold">السجل غير موجود</h1><p className="text-muted-foreground">ربما حُذف الملف الذي كان يحتوي هذا السجل.</p><Button asChild><Link href="/search">العودة إلى البحث</Link></Button></div></div>; }
