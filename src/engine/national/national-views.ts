// L1 Fase 6 — view-models puros das telas da seleção nacional. Sem React/Expo/DB:
// recebem dados já carregados pela tela e produzem estruturas prontas para render.
// Determinísticos e testáveis isoladamente.

import { Fixture } from '@/types';
import { Position } from '@/types';
import { StandingsEntry, calculateStandings } from '@/engine/competition/standings';
import { INTERNATIONAL_BREAK_WEEKS } from './international-duty';

/** Janela FIFA "ativa" para gerir convocação: a próxima janela ≥ week (volta à 1ª no fim). */
export function activeNationalWindow(week: number): number {
  return INTERNATIONAL_BREAK_WEEKS.find((w) => w >= week) ?? INTERNATIONAL_BREAK_WEEKS[0];
}

// ─── Convocação + XI ─────────────────────────────────────────────────────────

export interface NationalPoolPlayer {
  id: number;
  name: string;
  position: Position;
  overall: number;
}

export interface NationalCallUpLite {
  playerId: number;
  isStarter: boolean;
  source: 'auto' | 'manual';
}

export interface NationalSquadRow extends NationalPoolPlayer {
  calledUp: boolean;
  isStarter: boolean;
  isManual: boolean;
}

export interface NationalSquadView {
  rows: NationalSquadRow[];
  /** Preview do XI inicial (top-11). Usa os titulares convocados; senão top-11 do pool. */
  xi: NationalSquadRow[];
  calledCount: number;
}

const XI_SIZE = 11;

/**
 * Cruza o pool elegível com a convocação persistida. As linhas saem ordenadas por overall
 * desc (desempate id asc). O XI prioriza titulares manuais, depois overall; sem convocação
 * cai para o top-11 do próprio pool (preview informativo).
 */
export function buildNationalSquadView(
  pool: readonly NationalPoolPlayer[],
  callUps: readonly NationalCallUpLite[],
): NationalSquadView {
  const callById = new Map(callUps.map((c) => [c.playerId, c]));
  const rows: NationalSquadRow[] = [...pool]
    .sort((a, b) => b.overall - a.overall || a.id - b.id)
    .map((p) => {
      const c = callById.get(p.id);
      return {
        ...p,
        calledUp: c !== undefined,
        isStarter: c?.isStarter ?? false,
        isManual: c?.source === 'manual',
      };
    });

  const starters = rows
    .filter((r) => r.calledUp && r.isStarter)
    .sort((a, b) => {
      if (a.isManual !== b.isManual) return a.isManual ? -1 : 1;
      return b.overall - a.overall || a.id - b.id;
    });
  const xi = (starters.length > 0 ? starters : rows).slice(0, XI_SIZE);

  return { rows, xi, calledCount: rows.filter((r) => r.calledUp).length };
}

// ─── Calendário + Tabela + Mata-mata ─────────────────────────────────────────

export interface NationalFixtureRow {
  id: number;
  week: number;
  round: number | null;
  homeId: number;
  awayId: number;
  homeName: string;
  awayName: string;
  homeGoals: number | null;
  awayGoals: number | null;
  played: boolean;
  involvesUser: boolean;
}

export interface NationalStandingRow extends StandingsEntry {
  rank: number;
  name: string;
  isUser: boolean;
}

export interface NationalKnockoutRound {
  round: number;
  fixtures: NationalFixtureRow[];
}

export interface NationalCalendarView {
  qualifiers: NationalFixtureRow[];
  knockout: NationalKnockoutRound[];
  standings: NationalStandingRow[];
}

export interface CalendarTeam {
  id: number;
  name: string;
}

/**
 * Particiona os jogos da temporada em eliminatória (competição de qualificação) e
 * mata-mata (qualquer outra competição), calcula a classificação sobre os jogos da
 * eliminatória e marca os confrontos da seleção dirigida. Puro.
 */
export function buildNationalCalendarView(params: {
  fixtures: readonly Fixture[];
  teams: readonly CalendarTeam[];
  qualifierCompetitionId: number;
  userNationId: number | null;
}): NationalCalendarView {
  const { fixtures, teams, qualifierCompetitionId, userNationId } = params;
  const nameById = new Map(teams.map((t) => [t.id, t.name]));
  const name = (id: number) => nameById.get(id) ?? String(id);

  const toRow = (f: Fixture): NationalFixtureRow => ({
    id: f.id,
    week: f.week,
    round: f.round,
    homeId: f.homeClubId,
    awayId: f.awayClubId,
    homeName: name(f.homeClubId),
    awayName: name(f.awayClubId),
    homeGoals: f.homeGoals,
    awayGoals: f.awayGoals,
    played: f.played,
    involvesUser:
      userNationId !== null && (f.homeClubId === userNationId || f.awayClubId === userNationId),
  });

  const qualifierFixtures = fixtures.filter((f) => f.competitionId === qualifierCompetitionId);
  const knockoutFixtures = fixtures.filter((f) => f.competitionId !== qualifierCompetitionId);

  const qualifiers = qualifierFixtures
    .map(toRow)
    .sort((a, b) => a.week - b.week || (a.round ?? 0) - (b.round ?? 0) || a.id - b.id);

  const participantIds = [
    ...new Set(qualifierFixtures.flatMap((f) => [f.homeClubId, f.awayClubId])),
  ];
  const table = calculateStandings(qualifierFixtures as Fixture[], participantIds);
  const standings: NationalStandingRow[] = table.map((e, i) => ({
    ...e,
    rank: i + 1,
    name: name(e.clubId),
    isUser: userNationId !== null && e.clubId === userNationId,
  }));

  const byRound = new Map<number, NationalFixtureRow[]>();
  for (const f of knockoutFixtures) {
    const r = f.round ?? 0;
    const list = byRound.get(r) ?? [];
    list.push(toRow(f));
    byRound.set(r, list);
  }
  const knockout: NationalKnockoutRound[] = [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, fxs]) => ({ round, fixtures: fxs.sort((a, b) => a.id - b.id) }));

  return { qualifiers, knockout, standings };
}
