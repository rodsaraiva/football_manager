import Database from 'better-sqlite3';
import { createAllTables } from '@/database/schema';
import { generateSeedData } from '../../scripts/generate-seed-data';
import { createTestDbHandle, seedReferenceTables, seedWorldForSave } from '../database/test-helpers';
import { saveOffset } from '@/database/constants';
import { insertYouthLoan, getActiveYouthLoans } from '@/database/queries/youth';

describe('youth save-isolation', () => {
  it('loans de save A não aparecem em save B', async () => {
    const raw = new Database(':memory:');
    raw.pragma('foreign_keys = OFF');
    createAllTables(raw);
    const db = createTestDbHandle(raw);
    const data = generateSeedData(42);
    const club = data.clubs[0];
    seedReferenceTables(raw, data);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (1,'A',?, '', '')").run(saveOffset(1) + club.id);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (2,'B',?, '', '')").run(saveOffset(2) + club.id);
    seedWorldForSave(raw, data, 1);
    seedWorldForSave(raw, data, 2);

    const clubA = raw.prepare('SELECT id FROM clubs WHERE save_id = 1 LIMIT 1').get() as { id: number };
    const club2A = raw.prepare('SELECT id FROM clubs WHERE save_id = 1 AND id != ? LIMIT 1').get(clubA.id) as { id: number };
    const playerA = raw.prepare('SELECT id FROM players WHERE save_id = 1 AND club_id = ? LIMIT 1').get(clubA.id) as { id: number };
    await insertYouthLoan(db, 1, { playerId: playerA.id, parentClubId: clubA.id, loanClubId: club2A.id, startSeason: 1, loanEnd: 2 });

    const inA = await getActiveYouthLoans(db, 1, clubA.id);
    const inB = await getActiveYouthLoans(db, 2, clubA.id);
    expect(inA.length).toBeGreaterThan(0);
    expect(inB.length).toBe(0);
    raw.close();
  });
});
