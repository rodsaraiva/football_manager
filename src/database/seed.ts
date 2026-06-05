import { SeedData } from '../../scripts/generate-seed-data';
import { saveOffset } from './constants';

interface DbHandle {
  prepare(sql: string): { run(...params: unknown[]): void };
  exec(sql: string): void;
}

export function seedDatabase(db: DbHandle, data: SeedData): void {
  db.exec('BEGIN TRANSACTION');
  try {
    // Insert countries
    const insertCountry = db.prepare('INSERT INTO countries (id, name, code, continent) VALUES (?, ?, ?, ?)');
    for (const c of data.countries) insertCountry.run(c.id, c.name, c.code, c.continent);

    // Insert leagues
    const insertLeague = db.prepare('INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const l of data.leagues) insertLeague.run(l.id, l.name, l.countryId, l.divisionLevel, l.numTeams, l.promotionSpots, l.relegationSpots);

    // Insert clubs
    const insertClub = db.prepare('INSERT INTO clubs (id, name, short_name, country_id, league_id, reputation, budget, wage_budget, stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department, primary_color, secondary_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const c of data.clubs) insertClub.run(c.id, c.name, c.shortName, c.countryId, c.leagueId, c.reputation, c.budget, c.wageBudget, c.stadiumName, c.stadiumCapacity, c.trainingFacilities, c.youthAcademy, c.medicalDepartment, c.primaryColor, c.secondaryColor);

    // Insert players
    const insertPlayer = db.prepare('INSERT INTO players (id, name, nationality, age, position, secondary_position, club_id, wage, contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent, preferred_foot, weak_foot_ability) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const p of data.players) insertPlayer.run(p.id, p.name, p.nationality, p.age, p.position, p.secondaryPosition, p.clubId, p.wage, p.contractEnd, p.marketValue, p.basePotential, p.effectivePotential, p.morale, p.fitness, p.injuryWeeksLeft, p.isFreeAgent ? 1 : 0, p.preferredFoot, p.weakFootAbility);

    // Insert player attributes
    const insertAttrs = db.prepare('INSERT INTO player_attributes (player_id, finishing, passing, crossing, dribbling, heading, long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership, pace, stamina, strength, agility, jumping) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const a of data.playerAttributes) insertAttrs.run(a.playerId, a.finishing, a.passing, a.crossing, a.dribbling, a.heading, a.longShots, a.freeKicks, a.vision, a.composure, a.decisions, a.positioning, a.aggression, a.leadership, a.pace, a.stamina, a.strength, a.agility, a.jumping);

    // Insert staff
    const insertStaff = db.prepare('INSERT INTO staff (id, name, role, club_id, ability, wage, contract_end) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const s of data.staff) insertStaff.run(s.id, s.name, s.role, s.clubId, s.ability, s.wage, s.contractEnd);

    // Insert tactics
    const insertTactic = db.prepare('INSERT INTO tactics (id, club_id, name, is_active, formation, mentality, pressing, passing_style, tempo, width) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const t of data.tactics) insertTactic.run(t.id, t.clubId, t.name, t.isActive ? 1 : 0, t.formation, t.mentality, t.pressing, t.passingStyle, t.tempo, t.width);

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Inserts only the global reference tables (countries, leagues). Safe to call once per DB. */
export function seedReferenceTables(db: DbHandle, data: SeedData): void {
  const insertCountry = db.prepare('INSERT INTO countries (id, name, code, continent) VALUES (?, ?, ?, ?)');
  for (const c of data.countries) insertCountry.run(c.id, c.name, c.code, c.continent);
  const insertLeague = db.prepare('INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const l of data.leagues) insertLeague.run(l.id, l.name, l.countryId, l.divisionLevel, l.numTeams, l.promotionSpots, l.relegationSpots);
}

/**
 * Clones the world (clubs/players/attributes/staff/tactics) for one save, offsetting all
 * world ids and internal FKs by saveOffset(saveId). Reference FKs (country_id, league_id)
 * stay raw. Transactional: ROLLBACK on any error.
 */
export function seedWorldForSave(db: DbHandle, data: SeedData, saveId: number): void {
  const off = saveOffset(saveId);
  db.exec('BEGIN TRANSACTION');
  try {
    const insertClub = db.prepare('INSERT INTO clubs (id, save_id, name, short_name, country_id, league_id, reputation, budget, wage_budget, stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department, primary_color, secondary_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const c of data.clubs) insertClub.run(c.id + off, saveId, c.name, c.shortName, c.countryId, c.leagueId, c.reputation, c.budget, c.wageBudget, c.stadiumName, c.stadiumCapacity, c.trainingFacilities, c.youthAcademy, c.medicalDepartment, c.primaryColor, c.secondaryColor);

    const insertPlayer = db.prepare('INSERT INTO players (id, save_id, name, nationality, age, position, secondary_position, club_id, wage, contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent, preferred_foot, weak_foot_ability) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const p of data.players) insertPlayer.run(p.id + off, saveId, p.name, p.nationality, p.age, p.position, p.secondaryPosition, p.clubId === null ? null : p.clubId + off, p.wage, p.contractEnd, p.marketValue, p.basePotential, p.effectivePotential, p.morale, p.fitness, p.injuryWeeksLeft, p.isFreeAgent ? 1 : 0, p.preferredFoot, p.weakFootAbility);

    const insertAttrs = db.prepare('INSERT INTO player_attributes (player_id, save_id, finishing, passing, crossing, dribbling, heading, long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership, pace, stamina, strength, agility, jumping) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const a of data.playerAttributes) insertAttrs.run(a.playerId + off, saveId, a.finishing, a.passing, a.crossing, a.dribbling, a.heading, a.longShots, a.freeKicks, a.vision, a.composure, a.decisions, a.positioning, a.aggression, a.leadership, a.pace, a.stamina, a.strength, a.agility, a.jumping);

    const insertStaff = db.prepare('INSERT INTO staff (id, save_id, name, role, club_id, ability, wage, contract_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const s of data.staff) insertStaff.run(s.id + off, saveId, s.name, s.role, s.clubId === null ? null : s.clubId + off, s.ability, s.wage, s.contractEnd);

    const insertTactic = db.prepare('INSERT INTO tactics (id, save_id, club_id, name, is_active, formation, mentality, pressing, passing_style, tempo, width) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const t of data.tactics) insertTactic.run(t.id + off, saveId, t.clubId + off, t.name, t.isActive ? 1 : 0, t.formation, t.mentality, t.pressing, t.passingStyle, t.tempo, t.width);

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Escape a string for SQL single-quoted literal */
function esc(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * Generates the full seed SQL as a string (for use with execAsync on web).
 * This avoids sync prepared-statement calls that timeout in the web worker.
 */
export function generateSeedSQL(data: SeedData): string {
  const stmts: string[] = ['BEGIN TRANSACTION;'];

  for (const c of data.countries) {
    stmts.push(`INSERT INTO countries (id, name, code, continent) VALUES (${c.id}, ${esc(c.name)}, ${esc(c.code)}, ${esc(c.continent)});`);
  }

  for (const l of data.leagues) {
    stmts.push(`INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots) VALUES (${l.id}, ${esc(l.name)}, ${l.countryId}, ${l.divisionLevel}, ${l.numTeams}, ${l.promotionSpots}, ${l.relegationSpots});`);
  }

  for (const c of data.clubs) {
    stmts.push(`INSERT INTO clubs (id, name, short_name, country_id, league_id, reputation, budget, wage_budget, stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department, primary_color, secondary_color) VALUES (${c.id}, ${esc(c.name)}, ${esc(c.shortName)}, ${c.countryId}, ${c.leagueId}, ${c.reputation}, ${c.budget}, ${c.wageBudget}, ${esc(c.stadiumName)}, ${c.stadiumCapacity}, ${c.trainingFacilities}, ${c.youthAcademy}, ${c.medicalDepartment}, ${esc(c.primaryColor)}, ${esc(c.secondaryColor)});`);
  }

  for (const p of data.players) {
    stmts.push(`INSERT INTO players (id, name, nationality, age, position, secondary_position, club_id, wage, contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent, preferred_foot, weak_foot_ability) VALUES (${p.id}, ${esc(p.name)}, ${esc(p.nationality)}, ${p.age}, ${esc(p.position)}, ${esc(p.secondaryPosition)}, ${p.clubId}, ${p.wage}, ${p.contractEnd}, ${p.marketValue}, ${p.basePotential}, ${p.effectivePotential}, ${p.morale}, ${p.fitness}, ${p.injuryWeeksLeft}, ${p.isFreeAgent ? 1 : 0}, ${esc(p.preferredFoot)}, ${p.weakFootAbility});`);
  }

  for (const a of data.playerAttributes) {
    stmts.push(`INSERT INTO player_attributes (player_id, finishing, passing, crossing, dribbling, heading, long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership, pace, stamina, strength, agility, jumping) VALUES (${a.playerId}, ${a.finishing}, ${a.passing}, ${a.crossing}, ${a.dribbling}, ${a.heading}, ${a.longShots}, ${a.freeKicks}, ${a.vision}, ${a.composure}, ${a.decisions}, ${a.positioning}, ${a.aggression}, ${a.leadership}, ${a.pace}, ${a.stamina}, ${a.strength}, ${a.agility}, ${a.jumping});`);
  }

  for (const s of data.staff) {
    stmts.push(`INSERT INTO staff (id, name, role, club_id, ability, wage, contract_end) VALUES (${s.id}, ${esc(s.name)}, ${esc(s.role)}, ${s.clubId}, ${s.ability}, ${s.wage}, ${s.contractEnd});`);
  }

  for (const t of data.tactics) {
    stmts.push(`INSERT INTO tactics (id, club_id, name, is_active, formation, mentality, pressing, passing_style, tempo, width) VALUES (${t.id}, ${t.clubId}, ${esc(t.name)}, ${t.isActive ? 1 : 0}, ${esc(t.formation)}, ${esc(t.mentality)}, ${esc(t.pressing)}, ${esc(t.passingStyle)}, ${esc(t.tempo)}, ${esc(t.width)});`);
  }

  stmts.push('COMMIT;');
  return stmts.join('\n');
}

/** SQL-string variant of seedWorldForSave for execAsync on web (offset ids + save_id). */
export function generateWorldSeedSQLForSave(data: SeedData, saveId: number): string {
  const off = saveOffset(saveId);
  const stmts: string[] = ['BEGIN TRANSACTION;'];
  for (const c of data.clubs) stmts.push(`INSERT INTO clubs (id, save_id, name, short_name, country_id, league_id, reputation, budget, wage_budget, stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department, primary_color, secondary_color) VALUES (${c.id + off}, ${saveId}, ${esc(c.name)}, ${esc(c.shortName)}, ${c.countryId}, ${c.leagueId}, ${c.reputation}, ${c.budget}, ${c.wageBudget}, ${esc(c.stadiumName)}, ${c.stadiumCapacity}, ${c.trainingFacilities}, ${c.youthAcademy}, ${c.medicalDepartment}, ${esc(c.primaryColor)}, ${esc(c.secondaryColor)});`);
  for (const p of data.players) stmts.push(`INSERT INTO players (id, save_id, name, nationality, age, position, secondary_position, club_id, wage, contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent, preferred_foot, weak_foot_ability) VALUES (${p.id + off}, ${saveId}, ${esc(p.name)}, ${esc(p.nationality)}, ${p.age}, ${esc(p.position)}, ${esc(p.secondaryPosition)}, ${p.clubId === null ? 'NULL' : p.clubId + off}, ${p.wage}, ${p.contractEnd}, ${p.marketValue}, ${p.basePotential}, ${p.effectivePotential}, ${p.morale}, ${p.fitness}, ${p.injuryWeeksLeft}, ${p.isFreeAgent ? 1 : 0}, ${esc(p.preferredFoot)}, ${p.weakFootAbility});`);
  for (const a of data.playerAttributes) stmts.push(`INSERT INTO player_attributes (player_id, save_id, finishing, passing, crossing, dribbling, heading, long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership, pace, stamina, strength, agility, jumping) VALUES (${a.playerId + off}, ${saveId}, ${a.finishing}, ${a.passing}, ${a.crossing}, ${a.dribbling}, ${a.heading}, ${a.longShots}, ${a.freeKicks}, ${a.vision}, ${a.composure}, ${a.decisions}, ${a.positioning}, ${a.aggression}, ${a.leadership}, ${a.pace}, ${a.stamina}, ${a.strength}, ${a.agility}, ${a.jumping});`);
  for (const s of data.staff) stmts.push(`INSERT INTO staff (id, save_id, name, role, club_id, ability, wage, contract_end) VALUES (${s.id + off}, ${saveId}, ${esc(s.name)}, ${esc(s.role)}, ${s.clubId === null ? 'NULL' : s.clubId + off}, ${s.ability}, ${s.wage}, ${s.contractEnd});`);
  for (const t of data.tactics) stmts.push(`INSERT INTO tactics (id, save_id, club_id, name, is_active, formation, mentality, pressing, passing_style, tempo, width) VALUES (${t.id + off}, ${saveId}, ${t.clubId + off}, ${esc(t.name)}, ${t.isActive ? 1 : 0}, ${esc(t.formation)}, ${esc(t.mentality)}, ${esc(t.pressing)}, ${esc(t.passingStyle)}, ${esc(t.tempo)}, ${esc(t.width)});`);
  stmts.push('COMMIT;');
  return stmts.join('\n');
}
