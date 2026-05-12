import { DbHandle } from './players';
import { AssistantRole, AssistantWithQuality } from '@/types/assistant';
import { computeQualityStars, GeneratedAssistant } from '@/engine/assistant/assistant-engine';

interface AssistantRow {
  id: number;
  club_id: number;
  save_id: number;
  role: string;
  name: string;
  age: number;
  archetype: string;
  seasons_at_club: number;
  retirement_age: number;
  wage_per_month: number;
  will_retire_next_season: number;
}

function rowToAssistant(row: AssistantRow): AssistantWithQuality {
  return {
    id: row.id,
    clubId: row.club_id,
    saveId: row.save_id,
    role: row.role as AssistantRole,
    name: row.name,
    age: row.age,
    archetype: row.archetype as AssistantWithQuality['archetype'],
    seasonsAtClub: row.seasons_at_club,
    retirementAge: row.retirement_age,
    wagePerMonth: row.wage_per_month,
    willRetireNextSeason: row.will_retire_next_season === 1,
    qualityStars: computeQualityStars(row.seasons_at_club),
  };
}

export async function getAssistantsBySave(
  db: DbHandle,
  saveId: number,
): Promise<AssistantWithQuality[]> {
  const rows = await db
    .prepare('SELECT * FROM assistants WHERE save_id = ? ORDER BY role ASC')
    .all(saveId) as AssistantRow[];
  return rows.map(rowToAssistant);
}

export async function getAssistantByRole(
  db: DbHandle,
  saveId: number,
  role: AssistantRole,
): Promise<AssistantWithQuality | null> {
  const row = await db
    .prepare('SELECT * FROM assistants WHERE save_id = ? AND role = ? LIMIT 1')
    .get(saveId, role) as AssistantRow | undefined;
  return row ? rowToAssistant(row) : null;
}

export async function insertAssistant(
  db: DbHandle,
  data: GeneratedAssistant,
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT OR REPLACE INTO assistants
        (club_id, save_id, role, name, age, archetype, seasons_at_club, retirement_age, wage_per_month, will_retire_next_season)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.clubId, data.saveId, data.role, data.name, data.age, data.archetype,
      data.seasonsAtClub, data.retirementAge, data.wagePerMonth,
      data.willRetireNextSeason ? 1 : 0,
    );
  return (result as { lastInsertRowid: number }).lastInsertRowid;
}

export async function updateAssistantSeasonEnd(
  db: DbHandle,
  assistantId: number,
  newAge: number,
  newSeasonsAtClub: number,
  willRetireNextSeason: boolean,
): Promise<void> {
  await db
    .prepare(
      `UPDATE assistants
       SET age = ?, seasons_at_club = ?, will_retire_next_season = ?
       WHERE id = ?`,
    )
    .run(newAge, newSeasonsAtClub, willRetireNextSeason ? 1 : 0, assistantId);
}

export async function deleteAssistant(
  db: DbHandle,
  assistantId: number,
): Promise<void> {
  await db.prepare('DELETE FROM assistants WHERE id = ?').run(assistantId);
}

export async function dismissAssistant(
  db: DbHandle,
  assistantId: number,
): Promise<void> {
  await deleteAssistant(db, assistantId);
}
