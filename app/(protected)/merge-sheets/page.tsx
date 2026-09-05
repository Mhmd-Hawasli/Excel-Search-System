import { PageHeader } from "@/components/page-header";
import { SheetMergeInterface } from "@/components/sheet-merge/sheet-merge-interface";

export default function MergeSheetsPage() {
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="أدوات معزولة"
        title="دمج صفحات ملف اكسيل"
        description="ارفع ملف Excel واحد يحتوي على عدة صفحات، حدد عمود الرقم الوطني في الصفحة الأولى، ثم ادمج أي عدد من الصفحات الأخرى عن طريق الرقم الوطني في عمودها الأول. النتيجة ملف Excel واحد، ولا يُحفظ شيء في قاعدة بيانات الأرشيف."
      />
      <SheetMergeInterface />
    </div>
  );
}
