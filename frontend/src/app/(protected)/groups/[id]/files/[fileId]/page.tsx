"use client";

import { useParams } from "next/navigation";
import { FileDetail } from "@/features/files/file-detail";

export default function FileDetailPage() {
  const params = useParams<{ id: string; fileId: string }>();
  return <FileDetail groupId={params.id} fileId={params.fileId} />;
}
