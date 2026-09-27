"use client";

import { useId, useSyncExternalStore } from "react";

/**
 * قفل تصدير عام على مستوى المستخدم (وليس السيرفر): يسمح بعملية تصدير
 * واحدة فقط في المرة الواحدة داخل متصفح المستخدم، وبعد انتهائها يمكن
 * بدء تصدير آخر. يتزامن بين تبويبات المتصفح عبر localStorage.
 */

const STORAGE_KEY = "archive-export-lock";
const HEARTBEAT_MS = 5000;
const STALE_MS = 30000;

type LockRecord = { owner: string; tab: string; ts: number };

const TAB_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

let currentOwner: string | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
let cached: LockRecord | null = null;
let hasCache = false;

function emit() {
  for (const listener of listeners) listener();
}

function refresh() {
  cached = readLock();
  hasCache = true;
  emit();
}

function readLock(): LockRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as LockRecord;
    if (!record || typeof record.owner !== "string" || typeof record.ts !== "number") return null;
    if (Date.now() - record.ts > STALE_MS) return null;
    return record;
  } catch {
    return null;
  }
}

function stopHeartbeat() {
  if (heartbeat !== null) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

function startHeartbeat(owner: string) {
  stopHeartbeat();
  heartbeat = setInterval(() => {
    try {
      const record = readLockRaw();
      if (record && record.owner === owner && record.tab === TAB_ID) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...record, ts: Date.now() }));
      } else {
        stopHeartbeat();
      }
    } catch {
      stopHeartbeat();
    }
  }, HEARTBEAT_MS);
}

function readLockRaw(): LockRecord | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LockRecord) : null;
  } catch {
    return null;
  }
}

/** يحاول حجز قفل التصدير. يعيد false إذا كان هناك تصدير جارٍ لمالك آخر. */
export function tryAcquireExportLock(owner: string): boolean {
  if (typeof window === "undefined") return false;
  const record = readLock();
  if (record && (record.owner !== owner || record.tab !== TAB_ID)) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, tab: TAB_ID, ts: Date.now() }));
  } catch {
    return false;
  }
  currentOwner = owner;
  startHeartbeat(owner);
  refresh();
  return true;
}

/** يحرر قفل التصدير إذا كان محتجزًا من نفس المالك. */
export function releaseExportLock(owner: string) {
  if (typeof window === "undefined") return;
  try {
    const record = readLockRaw();
    if (record && record.owner === owner && record.tab === TAB_ID) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* تجاهل */
  }
  if (currentOwner === owner) {
    currentOwner = null;
    stopHeartbeat();
  }
  refresh();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): LockRecord | null {
  if (!hasCache) {
    cached = readLock();
    hasCache = true;
  }
  return cached;
}

function getServerSnapshot(): LockRecord | null {
  return null;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) refresh();
  });
  window.addEventListener("pagehide", () => {
    if (currentOwner) releaseExportLock(currentOwner);
  });
}

/**
 * خطاف React لقفل التصدير:
 * - active: يوجد تصدير جارٍ (لأي مالك)
 * - mine: التصدير الجاري هو لهذا الزر نفسه
 * - blocked: يوجد تصدير جارٍ لزر آخر → يجب تعطيل الزر
 */
export function useExportLock() {
  const owner = useId();
  const record = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const active = record !== null;
  const mine = active && record.owner === owner && record.tab === TAB_ID;
  return {
    owner,
    active,
    mine,
    blocked: active && !mine,
    tryAcquire: () => tryAcquireExportLock(owner),
    release: () => releaseExportLock(owner),
  };
}
