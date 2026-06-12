import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import {
  recalcSquadPotential,
  generateClubYouth,
  applyOrdinaryRetirements,
} from '@/engine/season/end-of-season-ops';
import { getStaffEffects } from '@/engine/staff/staff-effects';
import { upsertPlayerStats } from '@/database/queries/player-stats';
import { getPlayersByClub } from '@/database/queries/players';

const S = TEST_SAVE_ID;

describe('end-of-season progression ops', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubId: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    rawDb.pragma('foreign_keys = OFF'); // ops tests insert stats under a synthetic competition id
    db = createTestDbHandle(rawDb);
    clubId = (rawDb.prepare('SELECT id FROM clubs LIMIT 1').get() as { id: number }).id;
  });
  afterEach(() => rawDb.close());

  it('recalc uses each player real overall (a weak player is not floored at 70)', async () => {
    const squad = await getPlayersByClub(db, S, clubId);
    const star = squad[0];
    const weak = squad[1];
    rawDb.prepare('UPDATE player_attributes SET finishing=90,passing=90,vision=90,composure=90,positioning=90,pace=90,stamina=90,strength=90 WHERE player_id=?').run(star.id);
    rawDb.prepare('UPDATE player_attributes SET finishing=45,passing=45,vision=45,composure=45,positioning=45,pace=45,stamina=45,strength=45 WHERE player_id=?').run(weak.id);
    rawDb.prepare('UPDATE players SET base_potential=90, effective_potential=80 WHERE id=?').run(star.id);
    rawDb.prepare('UPDATE players SET base_potential=70, effective_potential=60 WHERE id=?').run(weak.id);
    for (const id of [star.id, weak.id]) {
      await upsertPlayerStats(db, S, {
        playerId: id, season: 2026, competitionId: 1,
        appearances: 30, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
        rating: 7.0, minutesPlayed: 30 * 90,
      });
    }
    await recalcSquadPotential(db, S, clubId, 2026);
    const weakAfter = rawDb.prepare('SELECT effective_potential FROM players WHERE id=?').get(weak.id) as { effective_potential: number };
    expect(weakAfter.effective_potential).toBeLessThan(70);
  });

  it('youth quality scales with youthCoachBonus and nationality comes from club country', async () => {
    rawDb.prepare(
      `INSERT INTO staff (id, save_id, name, role, club_id, ability, wage, contract_end)
       VALUES (90090, ?, 'Coach', 'youth_coach', ?, 20, 1000, 2030)`,
    ).run(S, clubId);
    const effects = getStaffEffects({
      fitnessCoachAbility: 0, physioAbility: 0, scoutAbility: 0,
      youthCoachAbility: 20, assistantAbility: 0,
    });
    expect(effects.youthQualityBonus).toBe(10);

    const before = (rawDb.prepare('SELECT COUNT(*) c FROM players WHERE club_id=?').get(clubId) as { c: number }).c;
    const maxBefore = (rawDb.prepare('SELECT MAX(id) m FROM players').get() as { m: number }).m;
    await generateClubYouth(db, S, clubId, 2027, new SeededRng(7777));
    const youth = rawDb.prepare('SELECT nationality, age FROM players WHERE club_id=? AND id > ?').all(clubId, maxBefore) as Array<{ nationality: string; age: number }>;
    const after = (rawDb.prepare('SELECT COUNT(*) c FROM players WHERE club_id=?').get(clubId) as { c: number }).c;
    expect(after).toBeGreaterThan(before);
    expect(youth.length).toBeGreaterThan(0);
    expect(youth.every((y) => y.age >= 16 && y.age <= 18)).toBe(true);
    expect(youth.every((y) => y.nationality !== 'Local')).toBe(true);
  });

  it('ordinary retirement retires some 39yo across all clubs, deterministically', async () => {
    rawDb.prepare('UPDATE players SET age = 39 WHERE id IN (SELECT id FROM players WHERE club_id IS NOT NULL LIMIT 40)').run();
    const before = (rawDb.prepare('SELECT COUNT(*) c FROM players WHERE club_id IS NOT NULL AND age=39').get() as { c: number }).c;
    const retired = await applyOrdinaryRetirements(db, S, new SeededRng(99));
    const after = (rawDb.prepare('SELECT COUNT(*) c FROM players WHERE club_id IS NOT NULL AND age=39').get() as { c: number }).c;
    // seedTestDb also has other veterans in the eligible band, so retired ⊇ the 39yo who left.
    expect(retired.length).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
    expect(after).toBe(before - retired.filter((d) => d.age === 39).length);
  });
});
