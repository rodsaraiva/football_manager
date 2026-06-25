import type { DbHandle } from '@/database/queries/players';
import { getPlayersByClub, updatePlayerMorale } from '@/database/queries/players';
import { insertNewsItem } from '@/database/queries/news';
import { SeededRng } from '@/engine/rng';
import { computeMatchMoraleDelta, computeWeeklyMoraleDrift, applyMoraleDelta } from './morale-engine';
import { driver, sumDrivers, MoraleDriver, DriverCtx } from './driver-ledger';
import { personalityMoraleModifier, PersonalityArchetype } from './personality';
import { computeChemistryGroups, chemistryDriftBonus, ChemistryMember } from './chemistry';
import { nextFalloutState, FalloutState } from './fallout';
import {
  appendMoraleEvents, replaceChemistryLinks, setFalloutState, countRecentCriticisms,
} from '@/database/queries/morale';
import { FALLOUT_CRITICISM_LOOKBACK_WEEKS } from '@/engine/balance';

/** Aplica o modificador de personalidade a cada driver (preservando kind/season/week). */
function modulate(drivers: readonly MoraleDriver[], archetype: PersonalityArchetype): MoraleDriver[] {
  return drivers.map((d) => ({ ...d, delta: personalityMoraleModifier(archetype, d.kind, d.delta) }));
}

export async function applyMatchPsychology(
  db: DbHandle,
  saveId: number,
  clubId: number,
  matchInput: { outcome: 'win' | 'draw' | 'loss'; goalDiff: number; startingIds: Set<number> },
  season: number,
  week: number,
): Promise<void> {
  const squad = await getPlayersByClub(db, saveId, clubId);
  for (const p of squad) {
    const ctx: DriverCtx = { season, week, archetype: p.personality };
    const played = matchInput.startingIds.has(p.id);
    const raw = computeMatchMoraleDelta(
      {
        result: matchInput.outcome,
        played,
        minutesPlayed: played ? 90 : 0,
        goalDiff: matchInput.goalDiff,
        benchStreakWeeks: played ? 0 : (p.consecutiveLowMoraleWeeks ?? 0),
      },
      ctx,
    );
    const drivers = modulate(raw, p.personality);
    const next = applyMoraleDelta(p.morale, sumDrivers(drivers));
    if (next !== p.morale) await updatePlayerMorale(db, saveId, p.id, next);
    if (drivers.length > 0) await appendMoraleEvents(db, saveId, p.id, drivers);
  }
}

export async function applyWeeklyPsychology(
  db: DbHandle,
  saveId: number,
  clubId: number,
  season: number,
  week: number,
  rng: SeededRng,
): Promise<{ newlyWantsOut: number[] }> {
  const squad = await getPlayersByClub(db, saveId, clubId);
  const newlyWantsOut: number[] = [];

  // 1. Química do elenco nesta semana → persistir grafo.
  const members: ChemistryMember[] = squad.map((p) => ({
    id: p.id,
    nationality: p.nationality,
    age: p.age,
    seasonsAtClub: Math.max(0, p.contractEnd - season), // proxy de tempo de casa via contrato
    morale: p.morale,
  }));
  const groups = computeChemistryGroups(members, rng);
  await replaceChemistryLinks(db, saveId, clubId, groups);
  const groupByMember = new Map<number, (typeof groups)[number]>();
  for (const g of groups) for (const id of g.memberIds) groupByMember.set(id, g);

  // 2. Por jogador: drift idle + bônus de química → drivers; depois fallout.
  const lookbackWeek = Math.max(1, week - FALLOUT_CRITICISM_LOOKBACK_WEEKS);
  const lookbackSeason = week - FALLOUT_CRITICISM_LOOKBACK_WEEKS < 1 ? season - 1 : season;
  for (const p of squad) {
    const ctx: DriverCtx = { season, week, archetype: p.personality };
    const drivers: MoraleDriver[] = [];
    const drift = computeWeeklyMoraleDrift(p.morale, ctx);
    if (drift) drivers.push({ ...drift, delta: personalityMoraleModifier(p.personality, drift.kind, drift.delta) });
    const grp = groupByMember.get(p.id);
    const member = members.find((m) => m.id === p.id)!;
    if (grp) {
      const bonus = chemistryDriftBonus(grp, member);
      if (bonus !== 0) drivers.push(driver('chemistry', bonus, ctx));
    }
    const total = sumDrivers(drivers);
    const next = applyMoraleDelta(p.morale, total);
    if (next !== p.morale) await updatePlayerMorale(db, saveId, p.id, next);
    if (drivers.length > 0) await appendMoraleEvents(db, saveId, p.id, drivers);

    // 3. Fallout (usa a moral ATUAL pós-update + streak persistido + críticas recentes).
    const recentCriticisms = await countRecentCriticisms(db, saveId, p.id, lookbackSeason, lookbackWeek);
    const nextState: FalloutState = nextFalloutState({
      current: p.falloutState,
      morale: next,
      lowStreakWeeks: p.consecutiveLowMoraleWeeks ?? 0,
      archetype: p.personality,
      recentCriticisms,
    });
    if (nextState !== p.falloutState) {
      await setFalloutState(db, saveId, p.id, nextState);
      if (nextState === 'wantsOut' && p.falloutState !== 'wantsOut') {
        await db.prepare('UPDATE players SET is_transfer_listed = 1 WHERE save_id = ? AND id = ?').run(saveId, p.id);
        await insertNewsItem(db, saveId, {
          season, week, category: 'info',
          titleKey: 'psychology.news_wants_out_title', titleVars: { name: p.name },
          bodyKey: 'psychology.news_wants_out_body', bodyVars: { name: p.name },
          icon: '🚪', priority: 6,
        });
        newlyWantsOut.push(p.id);
      }
    }
  }
  return { newlyWantsOut };
}
