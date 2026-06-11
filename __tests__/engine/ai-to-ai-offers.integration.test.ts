import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { generateAiToAiOffers, generateAiOffersForSquad } from '@/engine/transfer/ai-offer-generator';
import { SeededRng } from '@/engine/rng';

const S = TEST_SAVE_ID;

describe('AI→AI offers', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('generateAiOffersForSquad creates offers for an arbitrary (non-player) AI club', async () => {
    // Run many weeks-worth of attempts to overcome the per-week probability gate.
    let total = 0;
    for (let i = 0; i < 30; i++) {
      total += await generateAiOffersForSquad(db, S, 5, new SeededRng(1000 + i), 1, 3);
    }
    expect(total).toBeGreaterThan(0);
    const rows = (await db
      .prepare('SELECT COUNT(*) as c FROM transfer_offers WHERE selling_club_id = 5')
      .get()) as { c: number };
    expect(rows.c).toBeGreaterThan(0);
  });

  it('generateAiToAiOffers samples multiple target clubs and creates offers', async () => {
    let total = 0;
    for (let i = 0; i < 30; i++) {
      total += await generateAiToAiOffers(db, S, new SeededRng(2000 + i), 1, 3);
    }
    expect(total).toBeGreaterThan(0);
    const distinct = (await db
      .prepare('SELECT COUNT(DISTINCT selling_club_id) as c FROM transfer_offers')
      .get()) as { c: number };
    expect(distinct.c).toBeGreaterThan(1); // offers target more than one club
  });
});
