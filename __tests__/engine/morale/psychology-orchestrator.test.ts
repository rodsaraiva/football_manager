import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { applyMatchPsychology, applyWeeklyPsychology } from '@/engine/morale/psychology-orchestrator';
import { getMoraleEvents, getChemistryGroups } from '@/database/queries/morale';
import { SeededRng } from '@/engine/rng';

const S = TEST_SAVE_ID;

describe('psychology orchestrator (real sqlite)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubId: number;
  let ids: number[];

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    const club = rawDb.prepare('SELECT club_id AS id FROM players WHERE club_id IS NOT NULL GROUP BY club_id ORDER BY COUNT(*) DESC LIMIT 1').get() as { id: number };
    clubId = club.id;
    ids = (rawDb.prepare('SELECT id FROM players WHERE save_id=? AND club_id=? ORDER BY id LIMIT 3').all(S, clubId) as Array<{ id: number }>).map((r) => r.id);
    rawDb.prepare('UPDATE players SET morale = 60 WHERE save_id=? AND club_id=?').run(S, clubId);
  });
  afterEach(() => rawDb.close());

  it('applyMatchPsychology atualiza moral E grava drivers que somam ao delta', async () => {
    const starter = ids[0];
    const benched = ids[1];
    await applyMatchPsychology(db, S, clubId, { outcome: 'win', goalDiff: 2, startingIds: new Set([starter]) }, 1, 5);

    const mStarter = rawDb.prepare('SELECT morale FROM players WHERE id=?').get(starter) as { morale: number };
    expect(mStarter.morale).toBeGreaterThan(60); // titular ganhou com a vitória
    const evStarter = await getMoraleEvents(db, S, starter, 10);
    expect(evStarter.some((e) => e.kind === 'matchWin')).toBe(true);
    const evBenched = await getMoraleEvents(db, S, benched, 10);
    expect(evBenched.some((e) => e.kind === 'benched')).toBe(true);
  });

  it('applyWeeklyPsychology grava chemistry_links, escala fallout, marca wantsOut e retorna ids', async () => {
    const victim = ids[0];
    // cenário de fallout: temperamental, já inquieto, moral baixa, streak alto, 2 críticas no ledger.
    rawDb.prepare("UPDATE players SET personality='temperamental', fallout_state='unsettled', morale=20, consecutive_low_morale_weeks=5 WHERE id=?").run(victim);
    rawDb.prepare("INSERT INTO morale_events (save_id,player_id,kind,delta,season,week) VALUES (?,?,'criticism',-3,1,3),(?,?,'criticism',-3,1,4)").run(S, victim, S, victim);

    const out = await applyWeeklyPsychology(db, S, clubId, 1, 5, new SeededRng(42));
    expect(out.newlyWantsOut).toContain(victim);

    const p = rawDb.prepare('SELECT fallout_state, is_transfer_listed FROM players WHERE id=?').get(victim) as { fallout_state: string; is_transfer_listed: number };
    expect(p.fallout_state).toBe('wantsOut');
    expect(p.is_transfer_listed).toBe(1);

    const groups = await getChemistryGroups(db, S, clubId);
    expect(groups.length).toBeGreaterThan(0);
  });

  it('determinístico: mesma seed → mesmo grafo de química', async () => {
    const a = createTestDb(); seedTestDb(a);
    const b = createTestDb(); seedTestDb(b);
    const ha = createTestDbHandle(a); const hb = createTestDbHandle(b);
    await applyWeeklyPsychology(ha, S, clubId, 1, 5, new SeededRng(7));
    await applyWeeklyPsychology(hb, S, clubId, 1, 5, new SeededRng(7));
    expect(await getChemistryGroups(ha, S, clubId)).toEqual(await getChemistryGroups(hb, S, clubId));
    a.close(); b.close();
  });
});
