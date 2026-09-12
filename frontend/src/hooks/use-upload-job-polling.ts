"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ApiEnvelope } from "@/types/api";
import type { UploadJobDto } from "@/types/model";
import { apiFetch } from "@/services/api-client";

/**
 * Tracks an upload/replace job: polls `/api/upload-jobs/:id` every 1200 ms
 * until it reaches a terminal status and notifies the user exactly once per
 * job. Statuses are UPPERCASE per the backend contract.
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
    // I02: sequential timeout chain (no overlapping polls), sequence guard
    // against stale out-of-order responses, AbortController cancel on
    // unmount/job change. Nominal 1200 ms cadence and one toast preserved.
    let cancelled = false;
    let seq = 0;
    let timer: number | undefined;
    const controller = new AbortController();
    const pollOnce = async () => {
      if (cancelled) return;
      const current = ++seq;
      try {
        const envelope = await apiFetch<ApiEnvelope<UploadJobDto>>(
          `/api/upload-jobs/${job.id}`,
          { signal: controller.signal },
        );
        // Ignore stale responses that arrive after a newer poll resolved.
        if (!cancelled && current === seq && envelope.data) setJob(envelope.data);
      } catch {
        /* keep polling; the terminal notify covers failures */
      }
      if (!cancelled) timer = window.setTimeout(pollOnce, intervalMs);
    };
    timer = window.setTimeout(pollOnce, intervalMs);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      controller.abort();
    };
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
