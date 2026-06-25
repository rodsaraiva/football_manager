import type { DbHandle } from './players';
import type { MoraleDriver, MoraleDriverKind } from '@/engine/morale/driver-ledger';
import type { PersonalityArchetype } from '@/engine/morale/personality';
import type { FalloutState } from '@/engine/morale/fallout';
import type { ChemistryGroup } from '@/engine/morale/chemistry';

export async function appendMoraleEvents(
  db: DbHandle, saveId: number, playerId: number, drivers: readonly MoraleDriver[],
): Promise<void> {
  for (const d of drivers) {
    await db
      .prepare('INSERT INTO morale_events (save_id, player_id, kind, delta, season, week) VALUES (?, ?, ?, ?, ?, ?)')
      .run(saveId, playerId, d.kind, d.delta, d.season, d.week);
  }
}

export async function getMoraleEvents(
  db: DbHandle, saveId: number, playerId: number, limit: number,
): Promise<MoraleDriver[]> {
  const rows = (await db
    .prepare(
      'SELECT kind, delta, season, week FROM morale_events WHERE save_id = ? AND player_id = ? ORDER BY season DESC, week DESC, id DESC LIMIT ?',
    )
    .all(saveId, playerId, limit)) as Array<{ kind: string; delta: number; season: number; week: number }>;
  return rows.map((r) => ({ kind: r.kind as MoraleDriverKind, delta: r.delta, season: r.season, week: r.week }));
}

export async function pruneMoraleEvents(
  db: DbHandle, saveId: number, keepSeasons: number, currentSeason: number,
): Promise<void> {
  const cutoff = currentSeason - keepSeasons + 1;
  await db.prepare('DELETE FROM morale_events WHERE save_id = ? AND season < ?').run(saveId, cutoff);
}

export async function setPlayerPersonality(
  db: DbHandle, saveId: number, playerId: number, p: PersonalityArchetype,
): Promise<void> {
  await db.prepare('UPDATE players SET personality = ? WHERE save_id = ? AND id = ?').run(p, saveId, playerId);
}

export async function setFalloutState(
  db: DbHandle, saveId: number, playerId: number, s: FalloutState,
): Promise<void> {
  await db.prepare('UPDATE players SET fallout_state = ? WHERE save_id = ? AND id = ?').run(s, saveId, playerId);
}

/** Conta críticas (kind='criticism') registradas no ledger desde (sinceSeason, sinceWeek) inclusive. */
export async function countRecentCriticisms(
  db: DbHandle, saveId: number, playerId: number, sinceSeason: number, sinceWeek: number,
): Promise<number> {
  const row = (await db
    .prepare(
      `SELECT COUNT(*) AS n FROM morale_events
        WHERE save_id = ? AND player_id = ? AND kind = 'criticism'
          AND (season > ? OR (season = ? AND week >= ?))`,
    )
    .get(saveId, playerId, sinceSeason, sinceSeason, sinceWeek)) as { n: number };
  return row.n;
}

export async function replaceChemistryLinks(
  db: DbHandle, saveId: number, clubId: number, groups: readonly ChemistryGroup[],
): Promise<void> {
  await db.prepare('DELETE FROM chemistry_links WHERE save_id = ? AND club_id = ?').run(saveId, clubId);
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    for (const pid of g.memberIds) {
      await db
        .prepare('INSERT INTO chemistry_links (save_id, club_id, group_idx, player_id, cohesion) VALUES (?, ?, ?, ?, ?)')
        .run(saveId, clubId, gi, pid, g.cohesion);
    }
  }
}

export async function getChemistryGroups(
  db: DbHandle, saveId: number, clubId: number,
): Promise<ChemistryGroup[]> {
  const rows = (await db
    .prepare(
      'SELECT group_idx, player_id, cohesion FROM chemistry_links WHERE save_id = ? AND club_id = ? ORDER BY group_idx, player_id',
    )
    .all(saveId, clubId)) as Array<{ group_idx: number; player_id: number; cohesion: number }>;
  const byIdx = new Map<number, ChemistryGroup>();
  for (const r of rows) {
    let g = byIdx.get(r.group_idx);
    if (!g) { g = { memberIds: [], cohesion: r.cohesion }; byIdx.set(r.group_idx, g); }
    g.memberIds.push(r.player_id);
  }
  return [...byIdx.keys()].sort((a, b) => a - b).map((k) => byIdx.get(k)!);
}
