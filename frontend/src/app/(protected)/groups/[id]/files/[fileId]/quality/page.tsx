"use client";

import { useParams } from "next/navigation";
import { FileQuality } from "@/features/files/file-quality";

export default function FileQualityPage() {
  const params = useParams<{ id: string; fileId: string }>();
  return <FileQuality groupId={params.id} fileId={params.fileId} />;
}
