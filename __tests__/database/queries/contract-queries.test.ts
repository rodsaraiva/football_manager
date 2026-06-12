import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../test-helpers';
import {
  DbHandle,
  getPlayersByClub,
  getFreeAgents,
  updatePlayerContract,
  getPlayerContractInfo,
} from '@/database/queries/players';

const S = TEST_SAVE_ID;

describe('contract & loan-wage queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubId: number;
  let playerId: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    const club = rawDb.prepare('SELECT id FROM clubs LIMIT 1').get() as { id: number };
    clubId = club.id;
    const player = rawDb.prepare('SELECT id FROM players WHERE club_id = ? LIMIT 1').get(clubId) as { id: number };
    playerId = player.id;
  });
  afterEach(() => rawDb.close());

  it('getPlayersByClub excludes free agents still pointing at the club', async () => {
    rawDb.prepare('UPDATE players SET is_free_agent = 1 WHERE id = ?').run(playerId);
    const squad = await getPlayersByClub(db, S, clubId);
    expect(squad.some((p) => p.id === playerId)).toBe(false);
  });

  it('exposes loanWage from the row (NULL when not on loan)', async () => {
    const squad = await getPlayersByClub(db, S, clubId);
    const p = squad.find((x) => x.id === playerId)!;
    expect(p.loanWage).toBeNull();
    rawDb.prepare('UPDATE players SET loan_wage = 400 WHERE id = ?').run(playerId);
    const squad2 = await getPlayersByClub(db, S, clubId);
    expect(squad2.find((x) => x.id === playerId)!.loanWage).toBe(400);
  });

  it('updatePlayerContract sets wage and contract_end', async () => {
    await updatePlayerContract(db, playerId, 77_000, 2030);
    const info = await getPlayerContractInfo(db, playerId);
    expect(info).toEqual({ wage: 77_000, contractEnd: 2030, clubId });
  });

  it('getPlayerContractInfo returns null for a missing player', async () => {
    expect(await getPlayerContractInfo(db, 9_999_999)).toBeNull();
  });

  it('a freed player (club_id NULL) appears in free agents, not in the squad', async () => {
    rawDb.prepare('UPDATE players SET is_free_agent = 1, club_id = NULL, wage = 0 WHERE id = ?').run(playerId);
    expect((await getPlayersByClub(db, S, clubId)).some((p) => p.id === playerId)).toBe(false);
    expect((await getFreeAgents(db, S)).some((p) => p.id === playerId)).toBe(true);
  });
});
