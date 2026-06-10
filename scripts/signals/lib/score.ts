// Signal scoring — turn a pile of raw references into a 0-100 signal_score.
//
// Weighted by reference type (a personal share/bookmark is a stronger vouch than
// a passing newsletter mention) and recency-decayed (a half-life so last year's
// buzz fades). Normalized through a saturating curve so a handful of strong,
// recent references already scores high without one viral entity pinning at 100.

export interface RawMention {
  type: string; // bookmarked | shared | mentioned | used | newsletter | influencer
  ts?: string; // ISO date; missing → treated as old (max decay floor)
  weightHint?: number; // optional per-mention multiplier (e.g. mention count in one doc)
}

const TYPE_WEIGHT: Record<string, number> = {
  shared: 10,
  bookmarked: 8,
  used: 7,
  influencer: 6,
  newsletter: 3,
  mentioned: 2,
};

const HALF_LIFE_DAYS = 150;
const SATURATION_K = 30; // larger → need more signal to approach 100

function recencyFactor(ts: string | undefined, now: Date): number {
  if (!ts) return 0.4; // unknown date → modest floor, not zero
  const t = Date.parse(ts.length === 4 ? `${ts}-06-01` : ts); // bare year → mid-year
  if (Number.isNaN(t)) return 0.4;
  const ageDays = Math.max(0, (now.getTime() - t) / 86_400_000);
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

export function scoreMentions(mentions: RawMention[], now: Date): number {
  let sum = 0;
  for (const m of mentions) {
    const w = TYPE_WEIGHT[m.type] ?? 1;
    sum += w * (m.weightHint ?? 1) * recencyFactor(m.ts, now);
  }
  // Saturating curve → 0-100.
  return Math.round(100 * (1 - Math.exp(-sum / SATURATION_K)));
}
