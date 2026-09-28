import linksData from "./column-links.json";
import { normalizeStored } from "@/lib/normalization";

/**
 * محرك الاقتراح التلقائي للتصدير المخصص: عند اختيار/كتابة اسم عمود
 * التصدير (يمين) يُقترح العمود الأصلي (يسار) بالترتيب التالي:
 *  1. ربط JSON اليدوي (column-links.json) — أولوية قصوى.
 *  2. تطابق تام بعد التطبيع.
 *  3. احتواء أحد الاسمين للآخر.
 *  4. تشابه Dice الثنائي بعتبة 0.58 (كاقتراحات الدمج).
 * الفواصل (_, -, /, \) توحَّد إلى مسافات قبل المطابقة، فيُطابَق
 * «هل_الزوج» مع «هل الزوج» تلقائيًا.
 */

type Link = { export: string; source: string };

/** الشرطات والفواصل تُعامل كمسافات قبل التطبيع العربي. */
export function unifySeparators(value: string): string {
  return value.replace(/[_\-/\\|]+/g, " ").replace(/\s+/g, " ").trim();
}

function normKey(value: string): string {
  return normalizeStored(unifySeparators(value));
}

const LINK_MAP = new Map<string, string>();
for (const link of (linksData.links ?? []) as Link[]) {
  const key = normKey(link.export ?? "");
  if (key && !LINK_MAP.has(key)) LINK_MAP.set(key, link.source ?? "");
}

function bigrams(value: string): Set<string> {
  if (value.length < 2) return new Set([value]);
  return new Set(Array.from({ length: value.length - 1 }, (_, i) => value.slice(i, i + 2)));
}

function diceScore(left: string, right: string): number {
  if (left === right) return 1;
  const a = bigrams(left);
  const b = bigrams(right);
  let overlap = 0;
  for (const item of a) if (b.has(item)) overlap += 1;
  return (2 * overlap) / (a.size + b.size || 1);
}

const DICE_THRESHOLD = 0.58;

export function suggestSource(header: string, sources: string[]): string | null {
  const norm = normKey(header);
  if (!norm) return null;
  const candidates = sources
    .map((raw) => ({ raw, norm: normKey(raw) }))
    .filter((c) => c.norm.length > 0);
  if (candidates.length === 0) return null;

  // 1. الربط اليدوي من JSON (يُشترط وجود المصدر فعلًا في الملف).
  const linked = LINK_MAP.get(norm);
  if (linked) {
    const hit = candidates.find((c) => c.norm === normKey(linked));
    if (hit) return hit.raw;
  }

  // 2-4. المطابقة العامة.
  let best: string | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score =
      norm === c.norm
        ? 1
        : norm.includes(c.norm) || c.norm.includes(norm)
          ? 0.9
          : diceScore(norm, c.norm);
    if (score > bestScore) {
      bestScore = score;
      best = c.raw;
    }
  }
  return bestScore >= DICE_THRESHOLD ? best : null;
}
