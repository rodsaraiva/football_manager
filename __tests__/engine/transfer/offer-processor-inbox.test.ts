import { createTestDb, createTestDbHandle } from '../../database/test-helpers';
import { processPendingOffers } from '@/engine/transfer/offer-processor';
import { getThreads } from '@/database/queries/inbox';
import { addDeadlineWeeks, OFFER_TTL_WEEKS, WEEKS_PER_SEASON } from '@/engine/inbox/producers';

function seed(db: import('better-sqlite3').Database): void {
  db.pragma('foreign_keys = OFF');
  db.prepare("INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, board_trust, created_at, updated_at) VALUES (1,'T',1,1,10,'normal',50,'','')").run();
  db.prepare('INSERT INTO countries (id, name, code, continent) VALUES (1,?,?,?)').run('X', 'XX', 'Europe');
  db.prepare('INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots) VALUES (1,?,1,1,3,0,0)').run('L');
  for (const [id, name] of [[10, 'My Club'], [20, 'Other A'], [30, 'Other B']] as const) {
    db.prepare(`INSERT INTO clubs (id, save_id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
      stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department, primary_color, secondary_color)
      VALUES (?,1,?,?,1,1,70,100000000,1000000,'S',20000,3,3,3,'#1','#2')`).run(id, name, name.slice(0, 3));
  }
  const ins = (id: number, club: number) => db.prepare(`INSERT INTO players (id, save_id, name, nationality, age, position, secondary_position, club_id, wage,
    contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent)
    VALUES (?,1,?,?,26,'ST',null,?,20000,3,10000000,75,75,70,90,0,0)`).run(id, 'P' + id, 'X', club);
  ins(1, 10); // do clube do jogador → gera thread
  ins(2, 20); // de outro clube → não gera thread p/ o jogador
  db.prepare(`INSERT INTO transfer_offers (id, save_id, player_id, offering_club_id, selling_club_id, fee_offered, wage_offered, status, offer_type)
    VALUES (1,1,1,20,10,8000000,30000,'pending','transfer')`).run();
  db.prepare(`INSERT INTO transfer_offers (id, save_id, player_id, offering_club_id, selling_club_id, fee_offered, wage_offered, status, offer_type)
    VALUES (2,1,2,30,20,8000000,30000,'pending','transfer')`).run();
}

describe('addDeadlineWeeks', () => {
  it('faz rollover de temporada puro', () => {
    expect(addDeadlineWeeks(1, 5, OFFER_TTL_WEEKS)).toEqual({ deadlineSeason: 1, deadlineWeek: 5 + OFFER_TTL_WEEKS });
    expect(addDeadlineWeeks(1, WEEKS_PER_SEASON - 1, 3)).toEqual({ deadlineSeason: 2, deadlineWeek: (WEEKS_PER_SEASON - 1 + 3) - WEEKS_PER_SEASON });
  });
});

describe('offer-processor inbox producer', () => {
  it('cria thread acionável quando o clube do jogador é o vendedor; nada p/ ofertas alheias', async () => {
    const raw = createTestDb(); seed(raw); const db = createTestDbHandle(raw);
    await processPendingOffers(db, 1, 1, 5, 10);
    const threads = await getThreads(db, 1);
    const transfer = threads.filter((t) => t.category === 'transfer' && t.actionKind === 'offer_response');
    expect(transfer).toHaveLength(1);
    expect(transfer[0].refKind).toBe('transfer_offer');
    expect(transfer[0].refId).toBe(1);
    expect(transfer[0].deadlineWeek).toBe(5 + OFFER_TTL_WEEKS);
    raw.close();
  });
});
