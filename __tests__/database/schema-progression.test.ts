import Database from 'better-sqlite3';
import { createTestDb } from './test-helpers';

describe('progression schema columns', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createTestDb();
    db.pragma('foreign_keys = OFF'); // schema-shape test: no seeded saves/players
  });
  afterEach(() => db.close());

  it('clubs has training_focus defaulting to balanced', () => {
    const cols = db.prepare('PRAGMA table_info(clubs)').all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('training_focus');
    db.prepare(
      `INSERT INTO clubs (id, save_id, name, short_name, country_id, league_id, reputation, budget,
        wage_budget, stadium_name, stadium_capacity, training_facilities, youth_academy,
        medical_department, primary_color, secondary_color)
       VALUES (1,1,'C','C',1,1,50,0,0,'S',1000,3,3,3,'#000','#fff')`,
    ).run();
    const row = db.prepare('SELECT training_focus FROM clubs WHERE id = 1').get() as { training_focus: string };
    expect(row.training_focus).toBe('balanced');
  });

  it('player_attributes has all 18 *_progress REAL columns defaulting to 0', () => {
    const cols = db.prepare('PRAGMA table_info(player_attributes)').all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    const progressCols = [
      'finishing_progress','passing_progress','crossing_progress','dribbling_progress',
      'heading_progress','long_shots_progress','free_kicks_progress','vision_progress',
      'composure_progress','decisions_progress','positioning_progress','aggression_progress',
      'leadership_progress','pace_progress','stamina_progress','strength_progress',
      'agility_progress','jumping_progress',
    ];
    for (const c of progressCols) expect(names).toContain(c);

    db.prepare(
      `INSERT INTO players (id,save_id,name,nationality,age,position,club_id,wage,contract_end,
        market_value,base_potential,effective_potential,morale,fitness)
       VALUES (1,1,'P','BR',30,'ST',NULL,0,0,0,80,80,70,100)`,
    ).run();
    db.prepare(
      `INSERT INTO player_attributes (player_id,save_id,finishing,passing,crossing,dribbling,heading,
        long_shots,free_kicks,vision,composure,decisions,positioning,aggression,leadership,
        pace,stamina,strength,agility,jumping)
       VALUES (1,1,70,70,70,70,70,70,70,70,70,70,70,70,70,70,70,70,70,70)`,
    ).run();
    const row = db.prepare('SELECT passing_progress FROM player_attributes WHERE player_id = 1').get() as { passing_progress: number };
    expect(row.passing_progress).toBe(0);
  });
});
