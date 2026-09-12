import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function GroupNotFound() { return <div className="grid min-h-[55vh] place-items-center text-center"><div className="space-y-3"><h1 className="text-2xl font-bold">المجموعة غير موجودة</h1><p className="text-muted-foreground">ربما حُذفت المجموعة أو تغير رابطها.</p><Button asChild><Link href="/groups">عرض المجموعات</Link></Button></div></div>; }
