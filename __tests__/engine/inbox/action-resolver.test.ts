import { createTestDb, createTestDbHandle } from '../../database/test-helpers';
import { openThread, getThreadView } from '@/database/queries/inbox';
import { resolveInboxAction } from '@/engine/inbox/action-resolver';

function seed(db: import('better-sqlite3').Database): void {
  db.pragma('foreign_keys = OFF');
  db.prepare("INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, board_trust, created_at, updated_at) VALUES (1,'T',1,1,10,'normal',50,'','')").run();
  db.prepare('INSERT INTO countries (id, name, code, continent) VALUES (1,?,?,?)').run('X', 'XX', 'Europe');
  db.prepare('INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots) VALUES (1,?,1,1,3,0,0)').run('L');
  for (const [id, name] of [[10, 'My Club'], [20, 'Other A']] as const) {
    db.prepare(`INSERT INTO clubs (id, save_id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
      stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department, primary_color, secondary_color)
      VALUES (?,1,?,?,1,1,70,100000000,1000000,'S',20000,3,3,3,'#1','#2')`).run(id, name, name.slice(0, 3));
  }
  db.prepare(`INSERT INTO players (id, save_id, name, nationality, age, position, secondary_position, club_id, wage,
    contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent)
    VALUES (1,1,?,?,26,'ST',null,10,20000,3,10000000,75,75,70,90,0,0)`).run('Souza', 'X');
  db.prepare(`INSERT INTO transfer_offers (id, save_id, player_id, offering_club_id, selling_club_id, fee_offered, wage_offered, status, offer_type)
    VALUES (1,1,1,20,10,8000000,30000,'pending','transfer')`).run();
}

describe('resolveInboxAction', () => {
  it('accept transfere o jogador, fecha a thread e anexa msg fromSelf', async () => {
    const raw = createTestDb(); seed(raw); const db = createTestDbHandle(raw);
    const tid = await openThread(db, 1, { category: 'transfer', refKind: 'transfer_offer', refId: 1, actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 8 },
      { season: 1, week: 5, titleKey: 'inbox.offer_received_title' as never, bodyKey: 'inbox.offer_received_body' as never, icon: '💰' });
    const r = await resolveInboxAction(db, 1, { threadId: tid, choice: 'accept', season: 1, week: 6, playerClubId: 10 });
    expect(r).toMatchObject({ ok: true, newStatus: 'resolved' });
    const player = raw.prepare('SELECT club_id FROM players WHERE id = 1').get() as { club_id: number };
    expect(player.club_id).toBe(20);
    const view = await getThreadView(db, 1, tid);
    expect(view!.status).toBe('resolved');
    expect(view!.messages.some((m) => m.fromSelf)).toBe(true);
    raw.close();
  });

  it('reject mantém o jogador e fecha a thread', async () => {
    const raw = createTestDb(); seed(raw); const db = createTestDbHandle(raw);
    const tid = await openThread(db, 1, { category: 'transfer', refKind: 'transfer_offer', refId: 1, actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 8 },
      { season: 1, week: 5, titleKey: 'inbox.offer_received_title' as never, bodyKey: 'inbox.offer_received_body' as never, icon: '💰' });
    const r = await resolveInboxAction(db, 1, { threadId: tid, choice: 'reject', season: 1, week: 6, playerClubId: 10 });
    expect(r.ok).toBe(true);
    expect((raw.prepare('SELECT club_id FROM players WHERE id = 1').get() as { club_id: number }).club_id).toBe(10);
    expect((raw.prepare('SELECT status FROM transfer_offers WHERE id = 1').get() as { status: string }).status).toBe('rejected');
    raw.close();
  });

  it('counter exige fee>0 e marca offer countered', async () => {
    const raw = createTestDb(); seed(raw); const db = createTestDbHandle(raw);
    const tid = await openThread(db, 1, { category: 'transfer', refKind: 'transfer_offer', refId: 1, actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 8 },
      { season: 1, week: 5, titleKey: 'inbox.offer_received_title' as never, bodyKey: 'inbox.offer_received_body' as never, icon: '💰' });
    expect((await resolveInboxAction(db, 1, { threadId: tid, choice: 'counter', season: 1, week: 6, playerClubId: 10 })).reason).toBe('inbox.err_counter_fee');
    const r = await resolveInboxAction(db, 1, { threadId: tid, choice: 'counter', season: 1, week: 6, playerClubId: 10, counterFee: 12000000 });
    expect(r.ok).toBe(true);
    const offer = raw.prepare('SELECT status, fee_offered FROM transfer_offers WHERE id = 1').get() as { status: string; fee_offered: number };
    expect(offer.status).toBe('countered');
    expect(offer.fee_offered).toBe(12000000);
    raw.close();
  });

  it('accept após deadline marca expired e não transfere', async () => {
    const raw = createTestDb(); seed(raw); const db = createTestDbHandle(raw);
    const tid = await openThread(db, 1, { category: 'transfer', refKind: 'transfer_offer', refId: 1, actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 6 },
      { season: 1, week: 5, titleKey: 'inbox.offer_received_title' as never, bodyKey: 'inbox.offer_received_body' as never, icon: '💰' });
    const r = await resolveInboxAction(db, 1, { threadId: tid, choice: 'accept', season: 1, week: 7, playerClubId: 10 });
    expect(r).toMatchObject({ ok: false, reason: 'inbox.err_expired', newStatus: 'expired' });
    expect((raw.prepare('SELECT club_id FROM players WHERE id = 1').get() as { club_id: number }).club_id).toBe(10);
    raw.close();
  });

  it('accept de oferta já não-pending falha e mantém a thread aberta', async () => {
    const raw = createTestDb(); seed(raw); const db = createTestDbHandle(raw);
    raw.prepare("UPDATE transfer_offers SET status = 'rejected' WHERE id = 1").run();
    const tid = await openThread(db, 1, { category: 'transfer', refKind: 'transfer_offer', refId: 1, actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 8 },
      { season: 1, week: 5, titleKey: 'inbox.offer_received_title' as never, bodyKey: 'inbox.offer_received_body' as never, icon: '💰' });
    const r = await resolveInboxAction(db, 1, { threadId: tid, choice: 'accept', season: 1, week: 6, playerClubId: 10 });
    expect(r.ok).toBe(false);
    expect((await getThreadView(db, 1, tid))!.status).toBe('open');
    raw.close();
  });
});
