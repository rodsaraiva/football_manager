import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { retirementPhase } from '@/engine/game-loop/retirement-phase';
import { WeekContext } from '@/engine/game-loop/week-context';
import { SeededRng } from '@/engine/rng';
import { Fixture } from '@/types';
import { RETIREMENT_MORALE_THRESHOLD } from '@/engine/balance';

// O UPDATE do streak de baixa moral (retirement-phase 7b) precisa ser save-isolado:
// avançar a fase num save NÃO pode tocar o streak de jogadores de outro save. Antes do
// fix o UPDATE rodava sem `save_id = ?` no WHERE, vazando entre saves.

const LOW_MORALE = RETIREMENT_MORALE_THRESHOLD - 1;

function insertSave(raw: Database.Database, id: number): void {
  raw.prepare(
    "INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (?, ?, 1, '', '')",
  ).run(id, `S${id}`);
}

function insertPlayer(
  raw: Database.Database,
  saveId: number,
  playerId: number,
  startStreak: number,
): void {
  raw.prepare(
    `INSERT INTO players (id, save_id, name, nationality, age, position, club_id, wage,
       contract_end, market_value, base_potential, effective_potential, morale, fitness,
       is_free_agent, consecutive_low_morale_weeks, will_retire_at_season_end)
     VALUES (?, ?, ?, 'BR', 35, 'ST', 1, 1000, 2, 1000000, 70, 70, ?, 80, 0, ?, 0)`,
  ).run(playerId, saveId, `P${playerId}`, LOW_MORALE, startStreak);
}

function mkContext(db: DbHandle, saveId: number): WeekContext {
  return {
    db,
    saveId,
    season: 1,
    week: 1, // fora da janela de anúncio → 7c não roda
    playerClubId: 1,
    rng: new SeededRng(1),
    fixtures: [],
    clubData: new Map(),
    playerFixture: {} as Fixture, // truthy → pula a psicologia de idle-week
    resultByFixture: new Map(),
    playerMatchResult: null,
  };
}

describe('retirementPhase — isolamento de save no streak de baixa moral', () => {
  it('avançar a fase num save não altera o streak de jogadores de outro save', async () => {
    const raw = createTestDb();
    raw.pragma('foreign_keys = OFF');
    insertSave(raw, 1);
    insertSave(raw, 2);
    insertPlayer(raw, 1, 101, 0); // save A: começa em 0
    insertPlayer(raw, 2, 201, 5); // save B: começa em 5, não deve mudar
    const db = createTestDbHandle(raw);

    await retirementPhase(mkContext(db, 1), false);

    const a = raw.prepare('SELECT consecutive_low_morale_weeks AS s FROM players WHERE id = 101').get() as { s: number };
    const b = raw.prepare('SELECT consecutive_low_morale_weeks AS s FROM players WHERE id = 201').get() as { s: number };

    expect(a.s).toBe(1); // save avançado incrementou (morale < threshold)
    expect(b.s).toBe(5); // outro save intacto

    raw.close();
  });
});
