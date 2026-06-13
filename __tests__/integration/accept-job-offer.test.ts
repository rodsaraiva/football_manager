import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { acceptJobOffer } from '@/engine/board/accept-job-offer';
import { insertJobOffer, getPendingJobOffers } from '@/database/queries/job-offers';
import { upsertBoardObjective, getBoardObjective } from '@/database/queries/board';
import { getManagerReputation, setManagerReputation, isPreseasonPending, isJobOffersPending, setJobOffersPending } from '@/database/queries/save';
import { BOARD_TRUST_INITIAL } from '@/engine/balance';
import { SeededRng } from '@/engine/rng';

const SAVE_ID = TEST_SAVE_ID;
const OFFER_SEASON = 2; // the season that just finished (offers keyed here)
const NEW_SEASON = 3;   // the upcoming season the manager will work

describe('acceptJobOffer (integration, real SQLite)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let currentClubId: number;
  let offeringClubId: number;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);

    currentClubId = (rawDb.prepare('SELECT player_club_id AS c FROM save_games WHERE id = ?').get(SAVE_ID) as { c: number }).c;
    // Pick a different club as the one offering the job.
    offeringClubId = (rawDb.prepare('SELECT id FROM clubs WHERE id != ? ORDER BY reputation DESC LIMIT 1').get(currentClubId) as { id: number }).id;

    // Seed the pre-switch state: a board objective + non-initial trust + an extra rival offer.
    await upsertBoardObjective(db, SAVE_ID, { clubId: currentClubId, season: NEW_SEASON, type: 'top_half', target: 8, description: '' });
    rawDb.prepare('UPDATE save_games SET board_trust = 90 WHERE id = ?').run(SAVE_ID);
    await setManagerReputation(db, SAVE_ID, 72);
    await setJobOffersPending(db, SAVE_ID, true);

    const otherRival = (rawDb.prepare('SELECT id FROM clubs WHERE id NOT IN (?, ?) ORDER BY id LIMIT 1').get(currentClubId, offeringClubId) as { id: number }).id;
    await insertJobOffer(db, SAVE_ID, OFFER_SEASON, offeringClubId);
    await insertJobOffer(db, SAVE_ID, OFFER_SEASON, otherRival);
  });
  afterEach(() => rawDb.close());

  it('switches the player club, resets board state, keeps manager reputation, and gates pre-season', async () => {
    const repBefore = await getManagerReputation(db, SAVE_ID);

    const result = await acceptJobOffer({
      db,
      saveId: SAVE_ID,
      offeringClubId,
      offerSeason: OFFER_SEASON,
      newSeason: NEW_SEASON,
      rng: new SeededRng(1),
    });

    // 1. player_club_id switched to the offering club.
    const clubAfter = (rawDb.prepare('SELECT player_club_id AS c FROM save_games WHERE id = ?').get(SAVE_ID) as { c: number }).c;
    expect(clubAfter).toBe(offeringClubId);
    expect(result.newClub.id).toBe(offeringClubId);

    // 2. board_trust reset to the initial value.
    const trust = (rawDb.prepare('SELECT board_trust AS t FROM save_games WHERE id = ?').get(SAVE_ID) as { t: number }).t;
    expect(trust).toBe(BOARD_TRUST_INITIAL);

    // 3. a fresh objective exists for the NEW club + NEW season.
    const obj = await getBoardObjective(db, SAVE_ID, offeringClubId, NEW_SEASON);
    expect(obj).not.toBeNull();
    expect(result.newObjective.clubId).toBe(offeringClubId);
    expect(result.newObjective.season).toBe(NEW_SEASON);

    // 4. accepted offer marked accepted, the other expired → no pending remain.
    const pending = await getPendingJobOffers(db, SAVE_ID, OFFER_SEASON);
    expect(pending).toHaveLength(0);
    const accepted = rawDb.prepare("SELECT offering_club_id AS c FROM job_offers WHERE status = 'accepted'").all() as { c: number }[];
    expect(accepted.map((r) => r.c)).toEqual([offeringClubId]);

    // 5. job-offers gate cleared; pre-season gate opened for the new club.
    expect(await isJobOffersPending(db, SAVE_ID)).toBe(false);
    expect(await isPreseasonPending(db, SAVE_ID)).toBe(true);

    // 6. manager reputation UNCHANGED (career persists across the switch).
    expect(await getManagerReputation(db, SAVE_ID)).toBe(repBefore);
  });
});
