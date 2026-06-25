import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import {
  appendMoraleEvents, getMoraleEvents, pruneMoraleEvents,
  setPlayerPersonality, setFalloutState, countRecentCriticisms,
  replaceChemistryLinks, getChemistryGroups,
} from '@/database/queries/morale';
import { MoraleDriver } from '@/engine/morale/driver-ledger';

const S = TEST_SAVE_ID;
const d = (kind: MoraleDriver['kind'], delta: number, season: number, week: number): MoraleDriver =>
  ({ kind, delta, season, week });

describe('morale ledger / chemistry / personality queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let playerId: number;
  let clubId: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    const p = rawDb.prepare('SELECT id, club_id FROM players WHERE club_id IS NOT NULL LIMIT 1').get() as { id: number; club_id: number };
    playerId = p.id;
    clubId = p.club_id;
    // a second save, sharing the same world ids, to prove save isolation
    rawDb.pragma('foreign_keys = OFF');
    rawDb.prepare(
      "INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, board_trust, created_at, updated_at) VALUES (2, 'B', 1, 1, ?, 'normal', 50, '', '')",
    ).run(clubId);
    rawDb.pragma('foreign_keys = ON');
  });
  afterEach(() => rawDb.close());

  it('append/get respeita save_id e ordem (mais recente primeiro)', async () => {
    await appendMoraleEvents(db, S, playerId, [d('matchWin', 3, 1, 1), d('chemistry', 1.2, 1, 2)]);
    const got = await getMoraleEvents(db, S, playerId, 10);
    expect(got).toHaveLength(2);
    expect(got[0].kind).toBe('chemistry'); // season/week desc
    expect(await getMoraleEvents(db, 2, playerId, 10)).toHaveLength(0);
  });

  it('pruneMoraleEvents mantém só keepSeasons', async () => {
    await appendMoraleEvents(db, S, playerId, [d('matchWin', 3, 1, 1), d('matchLoss', -4, 2, 1), d('teamTalk', 2, 3, 1)]);
    await pruneMoraleEvents(db, S, 2, 3); // keep seasons 2 e 3
    const got = await getMoraleEvents(db, S, playerId, 10);
    expect(got.map((x) => x.season).sort()).toEqual([2, 3]);
  });

  it('countRecentCriticisms conta só criticism na janela', async () => {
    await appendMoraleEvents(db, S, playerId, [
      d('criticism', -3, 1, 1), d('criticism', -3, 1, 5), d('praise', 2, 1, 5),
    ]);
    expect(await countRecentCriticisms(db, S, playerId, 1, 3)).toBe(1); // só a da semana 5
    expect(await countRecentCriticisms(db, S, playerId, 1, 1)).toBe(2);
  });

  it('setPlayerPersonality/setFalloutState persistem e isolam por save', async () => {
    await setPlayerPersonality(db, S, playerId, 'leader');
    await setFalloutState(db, S, playerId, 'unsettled');
    const row = rawDb.prepare('SELECT personality, fallout_state FROM players WHERE save_id=? AND id=?').get(S, playerId) as { personality: string; fallout_state: string };
    expect(row.personality).toBe('leader');
    expect(row.fallout_state).toBe('unsettled');
  });

  it('replace/getChemistryGroups substitui e isola por clube/save', async () => {
    await replaceChemistryLinks(db, S, clubId, [{ memberIds: [playerId], cohesion: 0.8 }]);
    let groups = await getChemistryGroups(db, S, clubId);
    expect(groups).toEqual([{ memberIds: [playerId], cohesion: 0.8 }]);
    expect(await getChemistryGroups(db, 2, clubId)).toEqual([]);
    await replaceChemistryLinks(db, S, clubId, []); // substitui por vazio
    expect(await getChemistryGroups(db, S, clubId)).toEqual([]);
  });
});
