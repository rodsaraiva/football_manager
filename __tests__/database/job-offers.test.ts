import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from './test-helpers';
import { DbHandle } from '@/database/queries/players';
import {
  insertJobOffer,
  getPendingJobOffers,
  setJobOfferStatus,
} from '@/database/queries/job-offers';
import {
  getManagerReputation,
  setManagerReputation,
  isJobOffersPending,
  setJobOffersPending,
} from '@/database/queries/save';

const SAVE_ID = TEST_SAVE_ID;
const SEASON = 1;

describe('job-offers queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubA: number;
  let clubB: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    const clubs = rawDb.prepare('SELECT id FROM clubs ORDER BY id LIMIT 2').all() as { id: number }[];
    clubA = clubs[0].id;
    clubB = clubs[1].id;
  });
  afterEach(() => rawDb.close());

  it('inserts a pending offer and reads it back joined with club info', async () => {
    await insertJobOffer(db, SAVE_ID, SEASON, clubB);
    const offers = await getPendingJobOffers(db, SAVE_ID, SEASON);
    expect(offers).toHaveLength(1);
    expect(offers[0].offeringClubId).toBe(clubB);
    expect(typeof offers[0].clubName).toBe('string');
    expect(offers[0].clubName.length).toBeGreaterThan(0);
    expect(typeof offers[0].clubReputation).toBe('number');
    expect(typeof offers[0].leagueName).toBe('string');
  });

  it('getPendingJobOffers only returns pending offers for the given season', async () => {
    await insertJobOffer(db, SAVE_ID, SEASON, clubA);
    await insertJobOffer(db, SAVE_ID, SEASON, clubB);
    await setJobOfferStatus(db, SAVE_ID, SEASON, clubA, 'expired');
    const offers = await getPendingJobOffers(db, SAVE_ID, SEASON);
    expect(offers.map((o) => o.offeringClubId)).toEqual([clubB]);
  });

  it('does not leak offers from another season', async () => {
    await insertJobOffer(db, SAVE_ID, SEASON, clubA);
    await insertJobOffer(db, SAVE_ID, SEASON + 1, clubB);
    const offers = await getPendingJobOffers(db, SAVE_ID, SEASON);
    expect(offers.map((o) => o.offeringClubId)).toEqual([clubA]);
  });

  it('setJobOfferStatus updates a single offer status', async () => {
    await insertJobOffer(db, SAVE_ID, SEASON, clubA);
    await insertJobOffer(db, SAVE_ID, SEASON, clubB);
    await setJobOfferStatus(db, SAVE_ID, SEASON, clubB, 'accepted');
    const pending = await getPendingJobOffers(db, SAVE_ID, SEASON);
    expect(pending.map((o) => o.offeringClubId)).toEqual([clubA]);
    const accepted = rawDb
      .prepare("SELECT offering_club_id AS c FROM job_offers WHERE status = 'accepted'")
      .all() as { c: number }[];
    expect(accepted.map((r) => r.c)).toEqual([clubB]);
  });

  it('manager reputation defaults to 50 and round-trips', async () => {
    expect(await getManagerReputation(db, SAVE_ID)).toBe(50);
    await setManagerReputation(db, SAVE_ID, 63);
    expect(await getManagerReputation(db, SAVE_ID)).toBe(63);
  });

  it('job-offers gate flag mirrors the preseason gate behavior', async () => {
    expect(await isJobOffersPending(db, SAVE_ID)).toBe(false);
    await setJobOffersPending(db, SAVE_ID, true);
    expect(await isJobOffersPending(db, SAVE_ID)).toBe(true);
    await setJobOffersPending(db, SAVE_ID, false);
    expect(await isJobOffersPending(db, SAVE_ID)).toBe(false);
  });
});
