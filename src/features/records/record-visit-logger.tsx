"use client";

import { useEffect, useRef } from "react";

/**
 * Logs one record-page visit to the activity log. Mount-only (never on
 * link prefetch or server render), fire-and-forget: a failed beacon must
 * never disturb reading the record.
 */
export function RecordVisitLogger({ recordId }: { recordId: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    fetch(`/api/records/${recordId}/visit`, { method: "POST" }).catch(() => undefined);
  }, [recordId]);
  return null;
}
