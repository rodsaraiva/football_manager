import Database from 'better-sqlite3';
import { createAllTables } from '@/database/schema';
import { generateSeedData } from '../../scripts/generate-seed-data';

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  createAllTables(db);
  return db;
}

export function seedTestDb(db: Database.Database): void {
  const data = generateSeedData(42);

  // Insert countries
  const insertCountry = db.prepare(
    'INSERT INTO countries (id, name, code, continent) VALUES (?, ?, ?, ?)',
  );
  for (const c of data.countries) {
    insertCountry.run(c.id, c.name, c.code, c.continent);
  }

  // Insert leagues
  const insertLeague = db.prepare(
    `INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const l of data.leagues) {
    insertLeague.run(l.id, l.name, l.countryId, l.divisionLevel, l.numTeams, l.promotionSpots, l.relegationSpots);
  }

  // Insert clubs
  const insertClub = db.prepare(
    `INSERT INTO clubs (id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
      stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department,
      primary_color, secondary_color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const c of data.clubs) {
    const clamp5 = (v: number) => Math.max(1, Math.min(5, v));
    insertClub.run(
      c.id, c.name, c.shortName, c.countryId, c.leagueId, c.reputation, c.budget, c.wageBudget,
      c.stadiumName, c.stadiumCapacity, clamp5(c.trainingFacilities), clamp5(c.youthAcademy), clamp5(c.medicalDepartment),
      c.primaryColor, c.secondaryColor,
    );
  }

  // Insert players
  const insertPlayer = db.prepare(
    `INSERT INTO players (id, name, nationality, age, position, secondary_position, club_id, wage,
      contract_end, market_value, base_potential, effective_potential, morale, fitness,
      injury_weeks_left, is_free_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const p of data.players) {
    insertPlayer.run(
      p.id, p.name, p.nationality, p.age, p.position, p.secondaryPosition ?? null,
      p.clubId, p.wage, p.contractEnd, p.marketValue, p.basePotential, p.effectivePotential,
      p.morale, p.fitness, p.injuryWeeksLeft, p.isFreeAgent ? 1 : 0,
    );
  }

  // Insert player attributes
  const insertAttr = db.prepare(
    `INSERT INTO player_attributes (player_id, finishing, passing, crossing, dribbling, heading,
      long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership,
      pace, stamina, strength, agility, jumping)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const a of data.playerAttributes) {
    insertAttr.run(
      a.playerId, a.finishing, a.passing, a.crossing, a.dribbling, a.heading,
      a.longShots, a.freeKicks, a.vision, a.composure, a.decisions, a.positioning,
      a.aggression, a.leadership, a.pace, a.stamina, a.strength, a.agility, a.jumping,
    );
  }

  // Insert staff
  const insertStaff = db.prepare(
    `INSERT INTO staff (id, name, role, club_id, ability, wage, contract_end)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const s of data.staff) {
    const clamp20 = (v: number) => Math.max(1, Math.min(20, v));
    insertStaff.run(s.id, s.name, s.role, s.clubId, clamp20(s.ability), s.wage, s.contractEnd);
  }

  // Insert tactics
  const insertTactic = db.prepare(
    `INSERT INTO tactics (id, club_id, name, is_active, formation, mentality, pressing, passing_style, tempo, width)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const t of data.tactics) {
    insertTactic.run(
      t.id, t.clubId, t.name, t.isActive ? 1 : 0,
      t.formation, t.mentality, t.pressing, t.passingStyle, t.tempo, t.width,
    );
  }
}
