import { createTestDb, createTestDbHandle } from '../../database/test-helpers';
import { openThread, getThreadView } from '@/database/queries/inbox';
import { expireInboxDeadlines } from '@/engine/inbox/deadline-sweeper';

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

describe('expireInboxDeadlines', () => {
  it('expira só a acionável vencida, aplica default reject e é idempotente', async () => {
    const raw = createTestDb(); seed(raw); const db = createTestDbHandle(raw);
    const expired = await openThread(db, 1, { category: 'transfer', refKind: 'transfer_offer', refId: 1, actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 6 },
      { season: 1, week: 1, titleKey: 'inbox.offer_received_title' as never, bodyKey: 'inbox.offer_received_body' as never, icon: '💰' });
    const future = await openThread(db, 1, { category: 'transfer', refKind: 'transfer_offer', refId: 1, actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 12 },
      { season: 1, week: 1, titleKey: 'inbox.offer_received_title' as never, bodyKey: 'inbox.offer_received_body' as never, icon: '💰' });
    const info = await openThread(db, 1, { category: 'loan', actionKind: 'none', deadlineSeason: 1, deadlineWeek: 6 },
      { season: 1, week: 1, titleKey: 'inbox.loan_return_title' as never, bodyKey: 'inbox.loan_return_body' as never, icon: '↩️' });

    const n = await expireInboxDeadlines(db, 1, 1, 7);
    expect(n).toBe(1);
    expect((await getThreadView(db, 1, expired))!.status).toBe('expired');
    expect((await getThreadView(db, 1, future))!.status).toBe('open');
    expect((await getThreadView(db, 1, info))!.status).toBe('open');
    expect((raw.prepare('SELECT status FROM transfer_offers WHERE id = 1').get() as { status: string }).status).toBe('rejected');

    expect(await expireInboxDeadlines(db, 1, 1, 7)).toBe(0); // idempotente
    raw.close();
  });
});
