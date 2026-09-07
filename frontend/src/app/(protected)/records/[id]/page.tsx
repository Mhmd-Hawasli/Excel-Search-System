import { RecordDetails } from "@/features/records/record-details";

export const dynamic = "force-dynamic";

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecordDetails recordId={id} />;
}
