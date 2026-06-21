import { DbHandle } from '@/database/queries/players';

export interface AcademyOutput {
  promotedToFirstTeam: number;
  graduatesSoldForProfit: number;
  graduateStarterCount: number;
}

const REP_FLOOR = 1;
const REP_CAP = 100;
const DECAY_NO_OUTPUT = -1; // estagna/cai 1 ponto sem produtos

/** Delta clampado de reputação; o chamador soma a `current` e re-clampa [1,100]. */
export function computeAcademyReputationDelta(current: number, output: AcademyOutput): number {
  const raw =
    output.promotedToFirstTeam * 3 +
    output.graduatesSoldForProfit * 4 +
    output.graduateStarterCount * 2;
  if (raw === 0) return DECAY_NO_OUTPUT;
  // retornos decrescentes perto do topo: ganho menor quanto maior a reputação atual.
  const headroomFactor = (REP_CAP - current) / REP_CAP; // 0..1
  const delta = Math.round(raw * (0.5 + 0.5 * headroomFactor));
  return Math.max(-5, Math.min(10, delta));
}

/**
 * Calcula o output da temporada por clube (jovens promovidos a 'first'), aplica o
 * delta a clubs.academy_reputation (re-clampado) e grava academy_reputation_history.
 * Idempotente via UNIQUE(save,club,season) com INSERT OR IGNORE.
 */
export async function applyAcademyReputation(
  db: DbHandle, saveId: number, season: number,
): Promise<void> {
  const clubs = (await db
    .prepare('SELECT id, academy_reputation FROM clubs WHERE save_id = ?')
    .all(saveId)) as Array<{ id: number; academy_reputation: number }>;

  for (const club of clubs) {
    const promoted = (await db
      .prepare("SELECT COUNT(*) AS n FROM players WHERE save_id = ? AND club_id = ? AND squad_tier = 'first' AND age <= 21")
      .get(saveId, club.id)) as { n: number };
    const starters = (await db
      .prepare("SELECT COUNT(*) AS n FROM players WHERE save_id = ? AND club_id = ? AND squad_tier = 'first'")
      .get(saveId, club.id)) as { n: number };
    const output: AcademyOutput = {
      promotedToFirstTeam: promoted.n,
      graduatesSoldForProfit: 0, // V1: vendas não rastreadas por origem de academia
      graduateStarterCount: Math.min(starters.n, promoted.n),
    };
    const delta = computeAcademyReputationDelta(club.academy_reputation, output);
    const newRep = Math.max(REP_FLOOR, Math.min(REP_CAP, club.academy_reputation + delta));
    await db.prepare('UPDATE clubs SET academy_reputation = ? WHERE save_id = ? AND id = ?').run(newRep, saveId, club.id);
    await db
      .prepare(
        `INSERT OR IGNORE INTO academy_reputation_history (save_id, club_id, season, reputation, delta)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(saveId, club.id, season, newRep, delta);
  }
}
