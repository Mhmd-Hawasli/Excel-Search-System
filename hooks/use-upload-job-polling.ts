"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { UploadJobDto } from "@/types/upload-job";

/**
 * Tracks an upload/replace job: polls `/api/upload-jobs/:id` until it reaches
 * a terminal status and notifies the user exactly once per job. Previously
 * duplicated between the upload and file-update wizards.
 */
export function useUploadJobPolling({
  doneMessage,
  failedFallbackMessage,
  intervalMs = 1200,
}: {
  doneMessage: string;
  failedFallbackMessage: string;
  intervalMs?: number;
}) {
  const [job, setJob] = useState<UploadJobDto | null>(null);
  const notifiedJob = useRef<string | null>(null);

  useEffect(() => {
    if (!job || job.status === "DONE" || job.status === "FAILED") return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/upload-jobs/${job.id}`, { cache: "no-store" });
      if (response.ok) setJob((await response.json()) as UploadJobDto);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [job, intervalMs]);

  useEffect(() => {
    if (!job || notifiedJob.current === job.id) return;
    if (job.status === "DONE") {
      notifiedJob.current = job.id;
      toast.success(doneMessage);
    } else if (job.status === "FAILED") {
      notifiedJob.current = job.id;
      toast.error(job.errorMessage ?? failedFallbackMessage);
    }
  }, [job, doneMessage, failedFallbackMessage]);

  return [job, setJob] as const;
}

/** Progress percentage (0–100) of an upload job. */
export function uploadJobPercent(job: UploadJobDto): number {
  if (job.status === "DONE") return 100;
  return Math.round((job.processedRows / Math.max(1, job.totalRows)) * 100);
}
