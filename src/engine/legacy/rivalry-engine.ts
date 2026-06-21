import { Rivalry, RivalryOrigin } from '@/types/legacy';
import { SeededRng } from '@/engine/rng';

export interface RivalryClub { id: number; leagueId: number; countryId: number; divisionLevel: number; reputation: number; }
export interface HeadToHead { clubAId: number; clubBId: number; meetings: number; finals: number; titleDeciders: number; }

const MAX_RIVALS_PER_CLUB = 2;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function classifyPair(a: RivalryClub, b: RivalryClub): RivalryOrigin | null {
  if (a.leagueId === b.leagueId) return 'division';
  if (a.countryId === b.countryId && Math.abs(a.divisionLevel - b.divisionLevel) === 1) return 'regional';
  return null;
}

export function generateRivalries(clubs: readonly RivalryClub[], rng: SeededRng): Rivalry[] {
  const byId = new Map(clubs.map((c) => [c.id, c]));
  const sorted = [...clubs].sort((x, y) => x.id - y.id);
  const all: Rivalry[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      if (a.id === b.id) continue;
      const origin = classifyPair(a, b);
      if (!origin) continue;
      const repAvg = (a.reputation + b.reputation) / 2;
      const floor = origin === 'division' ? 50 : 35;
      const intensity = clamp(Math.round(floor + (repAvg - 50) / 2) + rng.nextInt(-5, 5), 1, 100);
      all.push({ clubAId: a.id, clubBId: b.id, intensity, origin });
    }
  }
  const ranked = [...all].sort((x, y) => (y.intensity - x.intensity)
    || (x.clubAId - y.clubAId) || (x.clubBId - y.clubBId));
  const count = new Map<number, number>();
  const kept: Rivalry[] = [];
  for (const r of ranked) {
    const ca = count.get(r.clubAId) ?? 0, cb = count.get(r.clubBId) ?? 0;
    if (ca >= MAX_RIVALS_PER_CLUB || cb >= MAX_RIVALS_PER_CLUB) continue;
    if (!byId.has(r.clubAId) || !byId.has(r.clubBId)) continue;
    kept.push(r); count.set(r.clubAId, ca + 1); count.set(r.clubBId, cb + 1);
  }
  return kept.sort((x, y) => (x.clubAId - y.clubAId) || (x.clubBId - y.clubBId));
}

export function reinforceIntensity(base: Rivalry, h2h: HeadToHead): number {
  return clamp(base.intensity + h2h.finals * 4 + h2h.titleDeciders * 8, 1, 100);
}
