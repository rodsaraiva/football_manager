import { DbHandle, getPlayersWithAttributesByIds, getPlayersWithAttributesByNationalities } from '@/database/queries/players';
import { Player, PlayerAttributes, Position } from '@/types';
import { Tactic } from '@/types/tactic';
import { calculateOverall } from '@/utils/overall';
import { SeededRng } from '@/engine/rng';
import { MatchResult, simulateMatch } from '@/engine/simulation/match-engine';
import { PlayerForStrength } from '@/engine/simulation/team-strength';
import { PlayerForPick, pickStartingEleven, buildBench } from '@/engine/simulation/squad-selection';
import {
  NationalSquadCandidate,
  selectNationalSquad,
  INTERNATIONAL_CALLUP_MIN_OVERALL,
} from '@/engine/national/international-duty';
import { DEMONYM_TO_COUNTRY } from '@/engine/national/nationality';
import { NATIONAL_SQUAD_SIZE } from '@/engine/balance';
import { NationalTeam } from '@/database/queries/national-teams';
import {
  getCallUps,
  countCallUps,
  upsertCallUp,
  NationalCallUp,
} from '@/database/queries/national-callups';

const NATIONAL_FORMATION = '4-4-2';
const NATIONAL_BENCH_SIZE = 8;

// Tática neutra para a seleção (espelha o fallback default de loadClubMatchData).
const DEFAULT_NATIONAL_TACTIC: Tactic = {
  id: 0, clubId: 0, name: 'National', isActive: true,
  formation: '4-4-2', mentality: 'balanced',
  pressing: 'medium', passingStyle: 'mixed',
  tempo: 'normal', width: 'normal',
  attackFocus: 'balanced', subStrategy: 'balanced',
};

type PlayerWithAttrs = Player & { attributes: PlayerAttributes };

export interface NationalLineup {
  squad: PlayerForStrength[]; // XI inicial
  bench: PlayerForStrength[];
}

function demonymsForCountry(countryName: string): string[] {
  return Object.entries(DEMONYM_TO_COUNTRY)
    .filter(([, name]) => name === countryName)
    .map(([demonym]) => demonym);
}

function toPlayerForPick(p: PlayerWithAttrs): PlayerForPick {
  return {
    id: p.id,
    position: p.position,
    secondaryPosition: p.secondaryPosition,
    attributes: p.attributes,
    morale: p.morale,
    fitness: p.fitness,
    injuryWeeksLeft: p.injuryWeeksLeft,
    suspensionWeeksLeft: p.suspensionWeeksLeft,
  };
}

function toStrength(p: PlayerWithAttrs, position: Position): PlayerForStrength {
  return {
    id: p.id,
    position,
    secondaryPosition: p.secondaryPosition,
    attributes: p.attributes,
    morale: p.morale,
    fitness: p.fitness,
  };
}

// Pool elegível da nação (≥ floor internacional), como PlayerForPick (atributos completos).
async function loadNationalPool(
  db: DbHandle,
  saveId: number,
  countryName: string,
): Promise<PlayerForPick[]> {
  const demonyms = demonymsForCountry(countryName);
  const players = await getPlayersWithAttributesByNationalities(db, saveId, demonyms);
  return players
    .filter((p) => calculateOverall(p.attributes, p.position) >= INTERNATIONAL_CALLUP_MIN_OVERALL)
    .map(toPlayerForPick);
}

function toCandidates(pool: PlayerForPick[]): NationalSquadCandidate[] {
  return pool.map((p) => ({
    id: p.id,
    position: p.position,
    overall: calculateOverall(p.attributes, p.position),
  }));
}

/**
 * Pré-convocação automática (IA) da seleção para a janela. Idempotente: se já há
 * convocação persistida (auto OU manual do usuário), não toca. Caso contrário monta os 23
 * do pool (selectNationalSquad), deriva o XI titular (pickStartingEleven sobre os 23) e
 * persiste as linhas 'auto' com is_starter. Determinística.
 */
export async function ensureAutoCallUps(
  db: DbHandle,
  saveId: number,
  nation: NationalTeam,
  season: number,
  window: number,
): Promise<boolean> {
  if ((await countCallUps(db, saveId, nation.id, season, window)) > 0) return false;

  const pool = await loadNationalPool(db, saveId, nation.name);
  if (pool.length === 0) return false;

  const squadIds = selectNationalSquad(toCandidates(pool), NATIONAL_SQUAD_SIZE);
  const byId = new Map(pool.map((p) => [p.id, p]));
  const squad = squadIds.map((id) => byId.get(id)!).filter(Boolean);

  const starterIds = new Set(pickStartingEleven(squad, NATIONAL_FORMATION).map((p) => p.id));

  for (const id of squadIds) {
    await upsertCallUp(db, saveId, {
      nationalTeamId: nation.id,
      season,
      window,
      playerId: id,
      isStarter: starterIds.has(id),
      source: 'auto',
    });
  }
  return true;
}

// Ordena a precedência de titulares: manual antes de auto, depois overall desc, id asc.
function starterPriority(
  a: { source: NationalCallUp['source']; overall: number; id: number },
  b: { source: NationalCallUp['source']; overall: number; id: number },
): number {
  if (a.source !== b.source) return a.source === 'manual' ? -1 : 1;
  return b.overall - a.overall || a.id - b.id;
}

/**
 * Monta o XI + reservas da seleção gerida a partir da convocação persistida. O override
 * MANUAL tem precedência sobre o auto: um titular manual entra no XI mesmo que isso
 * empurre o titular auto mais fraco para o banco. Determinístico.
 */
export async function buildUserNationLineup(
  db: DbHandle,
  saveId: number,
  nation: NationalTeam,
  season: number,
  window: number,
): Promise<NationalLineup> {
  const callUps = await getCallUps(db, saveId, nation.id, season, window);
  if (callUps.length === 0) return { squad: [], bench: [] };

  const players = await getPlayersWithAttributesByIds(db, saveId, callUps.map((c) => c.playerId));
  const byId = new Map(players.map((p) => [p.id, p]));

  const enriched = callUps
    .map((c) => {
      const p = byId.get(c.playerId);
      if (!p) return null;
      return { callUp: c, player: p, overall: calculateOverall(p.attributes, p.position) };
    })
    .filter((e): e is { callUp: NationalCallUp; player: PlayerWithAttrs; overall: number } => e !== null);

  const sortedStarters = enriched
    .filter((e) => e.callUp.isStarter)
    .sort((a, b) => starterPriority(
      { source: a.callUp.source, overall: a.overall, id: a.player.id },
      { source: b.callUp.source, overall: b.overall, id: b.player.id },
    ));
  const starters = sortedStarters.slice(0, 11);

  // Override manual derruba o titular de menor precedência — que costuma ser o GK (overall
  // baixo). Se o corte deixou o XI sem goleiro mas havia um titular GK, recoloca o melhor
  // GK descartado no lugar do titular mantido de menor precedência (o último, já que aqui
  // nenhum dos 11 é GK), garantindo um XI posicionalmente válido.
  if (starters.length === 11 && !starters.some((e) => e.player.position === 'GK')) {
    const droppedGk = sortedStarters.slice(11).find((e) => e.player.position === 'GK');
    if (droppedGk) starters[starters.length - 1] = droppedGk;
  }

  const starterIds = new Set(starters.map((e) => e.player.id));
  const bench = enriched
    .filter((e) => !starterIds.has(e.player.id))
    .sort((a, b) => b.overall - a.overall || a.player.id - b.player.id)
    .slice(0, NATIONAL_BENCH_SIZE);

  return {
    squad: starters.map((e) => toStrength(e.player, e.player.position)),
    bench: bench.map((e) => toStrength(e.player, e.player.position)),
  };
}

/**
 * XI sintético da seleção rival: top-23 do pool real, XI por posição + banco. Não persiste
 * convocação (rivais seguem por força agregada fora do jogo do usuário). Determinístico.
 */
export async function buildSyntheticNationLineup(
  db: DbHandle,
  saveId: number,
  countryName: string,
): Promise<NationalLineup> {
  const pool = await loadNationalPool(db, saveId, countryName);
  if (pool.length === 0) return { squad: [], bench: [] };

  // selectNationalSquad devolve os ids já ordenados (overall desc, id asc). Reconstruir o
  // squad NESSA ordem — e não na ordem de linha do SQL (que não tem ORDER BY) — torna o
  // desempate por ordem de entrada de pickStartingEleven/buildBench determinístico de fato,
  // independente da ordem de inserção no banco.
  const squadIds = selectNationalSquad(toCandidates(pool), NATIONAL_SQUAD_SIZE);
  const byId = new Map(pool.map((p) => [p.id, p]));
  const squad23 = squadIds.map((id) => byId.get(id)!).filter(Boolean);

  const xi = pickStartingEleven(squad23, NATIONAL_FORMATION);
  const startIds = new Set(xi.map((p) => p.id));
  const bench = buildBench(squad23, startIds).slice(0, NATIONAL_BENCH_SIZE);
  return { squad: xi, bench };
}

// Seed namespaced e estável da partida internacional (inclui saveId/season/week/fixtureId),
// independente do stream rng abstrato da janela.
export function nationalMatchSeed(saveId: number, season: number, week: number, fixtureId: number): number {
  return (saveId * 1_000_003 + season * 31 + week) * 1_000_003 + fixtureId;
}

export interface NationalMatchSides {
  home: NationalLineup;
  homeReputation: number;
  away: NationalLineup;
  awayReputation: number;
}

/**
 * Simula UMA partida internacional da seleção gerida via o match engine REAL (mesmo
 * pipeline dos jogos de clube), com seed namespaced. Devolve o MatchResult completo
 * (ratings/eventos) — o efeito observável que distingue do modelo abstrato.
 */
export function simulateNationalMatch(
  fixtureId: number,
  seed: number,
  sides: NationalMatchSides,
): MatchResult {
  return simulateMatch({
    fixtureId,
    homeSquad: sides.home.squad,
    awaySquad: sides.away.squad,
    homeBench: sides.home.bench,
    awayBench: sides.away.bench,
    homeTactic: DEFAULT_NATIONAL_TACTIC,
    awayTactic: DEFAULT_NATIONAL_TACTIC,
    homeClubReputation: sides.homeReputation,
    awayClubReputation: sides.awayReputation,
    rng: new SeededRng(seed),
  });
}
