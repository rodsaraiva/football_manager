import { z, ZodObject } from 'zod';
import { Fixture } from '@/types';
import { parseRows } from '../parse-rows';
import { saveOffset } from '../constants';
import { DbHandle } from './players';
import { createCompetition } from './leagues';
import { loadNationalTeams } from './national-teams';
import { generateRoundRobin } from '@/engine/competition/fixture-generator';
import { SeededRng } from '@/engine/rng';
import { INTERNATIONAL_BREAK_WEEKS } from '@/engine/national/international-duty';
import { NATIONAL_COMP_ID_BASE, NATIONAL_FIXTURE_ID_BASE } from '@/engine/balance';

const WINDOWS_PER_SEASON = INTERNATIONAL_BREAK_WEEKS.length;

// home/away ficam tipados como *_club_id no shape Fixture para reusar calculateStandings
// sem reescrever — aqui são national ids.
const nationalFixtureRowSchema = z
  .object({
    id: z.number(),
    competition_id: z.number(),
    season: z.number(),
    week: z.number(),
    round: z.number().nullable(),
    home_national_id: z.number(),
    away_national_id: z.number(),
    home_goals: z.number().nullable(),
    away_goals: z.number().nullable(),
    played: z.number(),
  })
  .passthrough();
type NationalFixtureRow = z.infer<typeof nationalFixtureRowSchema>;

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'national_fixtures', schema: nationalFixtureRowSchema },
];

function rowToFixture(row: NationalFixtureRow): Fixture {
  return {
    id: row.id,
    competitionId: row.competition_id,
    season: row.season,
    week: row.week,
    round: row.round,
    homeClubId: row.home_national_id,
    awayClubId: row.away_national_id,
    homeGoals: row.home_goals,
    awayGoals: row.away_goals,
    played: row.played === 1,
    attendance: null,
  };
}

interface CycleSchedule {
  baseSeason: number;
  competitionId: number;
  cycle: number;
  /** Full double round-robin of the cycle, mapped to (season, week, round). */
  fixtures: Array<{ id: number; season: number; week: number; round: number; homeId: number; awayId: number }>;
}

// Constrói o calendário inteiro de UM ciclo de eliminatória (determinístico por save+ciclo):
// sorteio dos confrontos via SeededRng, depois mapeia cada rodada lógica do round-robin para
// uma janela FIFA global (4/temporada). O ciclo dura ceil(rodadas / janelas-por-temporada)
// temporadas, então nunca encosta na semana SEASON_END.
function buildCycleSchedule(saveId: number, season: number, nationalIds: number[]): CycleSchedule {
  const off = saveOffset(saveId);

  // Round-robin "neutro" (startWeek 0 ⇒ week == índice da rodada lógica) para descobrir o nº de rodadas.
  const probe = generateRoundRobin(nationalIds, { competitionId: 0, season: 0, startWeek: 0 });
  const rounds = Math.max(...probe.map((f) => f.week)) + 1;
  const cycleSeasons = Math.ceil(rounds / WINDOWS_PER_SEASON);

  const cycle = Math.floor((season - 1) / cycleSeasons);
  const baseSeason = cycle * cycleSeasons + 1;
  const competitionId = off + NATIONAL_COMP_ID_BASE + cycle;

  // Sorteio dos confrontos: estável dentro do ciclo (baseSeason+competitionId constantes).
  const drawn = [...nationalIds];
  new SeededRng(baseSeason * 524287 + competitionId).shuffle(drawn);
  const rr = generateRoundRobin(drawn, { competitionId: 0, season: 0, startWeek: 0 });

  const fixtures = rr.map((f, i) => {
    const globalWindow = f.week; // 0..rounds-1
    return {
      id: off + NATIONAL_FIXTURE_ID_BASE + cycle * 100_000 + i,
      season: baseSeason + Math.floor(globalWindow / WINDOWS_PER_SEASON),
      week: INTERNATIONAL_BREAK_WEEKS[globalWindow % WINDOWS_PER_SEASON],
      round: globalWindow,
      homeId: f.homeClubId,
      awayId: f.awayClubId,
    };
  });

  return { baseSeason, competitionId, cycle, fixtures };
}

/**
 * Twin de ensureSeasonFixtures para a seleção: gera (se faltarem) os jogos internacionais
 * da temporada via batch INSERT multi-VALUES. Retorna true se gerou, false se já existiam ou
 * se não há seleções suficientes. Determinístico e save-isolado.
 */
export async function ensureNationalFixtures(db: DbHandle, saveId: number, season: number): Promise<boolean> {
  const teams = await loadNationalTeams(db, saveId);
  if (teams.length < 2) return false;

  const existing = (await db
    .prepare('SELECT COUNT(*) AS cnt FROM national_fixtures WHERE save_id = ? AND season = ?')
    .get(saveId, season)) as { cnt: number };
  if (existing.cnt > 0) return false;

  const ids = teams.map((t) => t.id);
  const schedule = buildCycleSchedule(saveId, season, ids);

  await ensureNationalCompetition(db, saveId, schedule.competitionId, schedule.baseSeason);

  const seasonFixtures = schedule.fixtures.filter((f) => f.season === season);
  if (seasonFixtures.length === 0) return false;

  const values = seasonFixtures
    .map(
      (f) =>
        `(${f.id}, ${saveId}, ${schedule.competitionId}, ${f.season}, ${f.week}, ${f.round}, ${f.homeId}, ${f.awayId}, 0)`,
    )
    .join(',');
  await db
    .prepare(
      `INSERT INTO national_fixtures
         (id, save_id, competition_id, season, week, round, home_national_id, away_national_id, played)
       VALUES ${values}`,
    )
    .run();

  return true;
}

async function ensureNationalCompetition(
  db: DbHandle,
  saveId: number,
  competitionId: number,
  baseSeason: number,
): Promise<void> {
  const row = await db
    .prepare('SELECT 1 AS x FROM competitions WHERE save_id = ? AND id = ?')
    .get(saveId, competitionId);
  if (row) return;
  await createCompetition(db, saveId, {
    id: competitionId,
    name: 'International Qualifiers',
    type: 'national',
    format: 'round_robin',
    season: baseSeason,
    leagueId: null,
  });
}

/** Todos os jogos internacionais da temporada no shape Fixture (entra direto em calculateStandings). */
export async function loadNationalFixtures(db: DbHandle, saveId: number, season: number): Promise<Fixture[]> {
  const rows = await db
    .prepare('SELECT * FROM national_fixtures WHERE save_id = ? AND season = ? ORDER BY id ASC')
    .all(saveId, season);
  return parseRows(nationalFixtureRowSchema, rows, 'national-fixtures.loadNationalFixtures').map(rowToFixture);
}

/** Jogos não jogados de uma janela específica (para simular o resultado abstrato). */
export async function loadNationalFixturesDue(
  db: DbHandle,
  saveId: number,
  season: number,
  week: number,
): Promise<Fixture[]> {
  const rows = await db
    .prepare(
      'SELECT * FROM national_fixtures WHERE save_id = ? AND season = ? AND week = ? AND played = 0 ORDER BY id ASC',
    )
    .all(saveId, season, week);
  return parseRows(nationalFixtureRowSchema, rows, 'national-fixtures.loadNationalFixturesDue').map(rowToFixture);
}

export async function updateNationalFixtureResult(
  db: DbHandle,
  saveId: number,
  fixtureId: number,
  homeGoals: number,
  awayGoals: number,
): Promise<void> {
  await db
    .prepare('UPDATE national_fixtures SET home_goals = ?, away_goals = ?, played = 1 WHERE save_id = ? AND id = ?')
    .run(homeGoals, awayGoals, saveId, fixtureId);
}
