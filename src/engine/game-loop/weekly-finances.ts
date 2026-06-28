import { getAssistantsBySave } from '@/database/queries/assistants';
import { maybeGenerateComment } from '@/engine/assistant/comment-generator';
import { AssistantComment } from '@/types/assistant';
import { SeededRng } from '@/engine/rng';
import { computeWeeklyClubFinance } from '@/engine/finance/weekly-finance';
import { WeekContext } from './week-context';

export interface WeeklyFinancesDelta {
  updatedBudget: number;
  assistantComment: AssistantComment | null;
}

// Fase: finanças semanais de cada clube com fixture (clube humano sempre incluído) +
// sinal de debt_weeks + comentário espontâneo de assistente. O comentário usa um rng
// próprio derivado de save/season/week (independente do stream principal).
export async function weeklyFinances(ctx: WeekContext): Promise<WeeklyFinancesDelta> {
  const { db, saveId, season, week, playerClubId, fixtures, resultByFixture } = ctx;

  // 4. Process weekly finances for player's club
  // Every club with a fixture this week runs the same weekly finance model; the
  // human club is always included (it pays wages even on a bye week). Bulk-loaded in
  // a handful of aggregate queries instead of ~9 awaits/club — the per-week loop spans
  // ~40 clubs and on expo-sqlite web each await is a worker round-trip.
  const financeClubIds = new Set<number>();
  for (const f of fixtures) { financeClubIds.add(f.homeClubId); financeClubIds.add(f.awayClubId); }
  financeClubIds.add(playerClubId);
  const financeClubList = [...financeClubIds];
  const inHolders = financeClubList.map(() => '?').join(',');

  const clubRows = (await db.prepare(
    `SELECT id, reputation, budget, stadium_capacity, training_facilities, youth_academy, medical_department
     FROM clubs WHERE save_id = ? AND id IN (${inHolders})`,
  ).all(saveId, ...financeClubList)) as Array<{
    id: number; reputation: number; budget: number; stadium_capacity: number;
    training_facilities: number; youth_academy: number; medical_department: number;
  }>;
  const clubById = new Map(clubRows.map(c => [c.id, c]));

  const wageRows = (await db.prepare(
    `SELECT club_id, COALESCE(SUM(wage), 0) AS w FROM players
     WHERE save_id = ? AND is_free_agent = 0 AND club_id IN (${inHolders}) GROUP BY club_id`,
  ).all(saveId, ...financeClubList)) as Array<{ club_id: number; w: number }>;
  const playerWageByClub = new Map(wageRows.map(r => [r.club_id, r.w]));

  const staffRows = (await db.prepare(
    `SELECT club_id, COALESCE(SUM(wage), 0) AS w FROM staff
     WHERE save_id = ? AND club_id IN (${inHolders}) GROUP BY club_id`,
  ).all(saveId, ...financeClubList)) as Array<{ club_id: number; w: number }>;
  const staffWageByClub = new Map(staffRows.map(r => [r.club_id, r.w]));

  // Competition type per home fixture — scales gate receipts (cup/continental > league).
  const compIds = [...new Set(fixtures.map(f => f.competitionId))];
  const compTypeById = new Map<number, 'league' | 'cup' | 'continental'>();
  if (compIds.length > 0) {
    const compRows = (await db.prepare(
      `SELECT id, type FROM competitions WHERE id IN (${compIds.map(() => '?').join(',')})`,
    ).all(...compIds)) as Array<{ id: number; type: string }>;
    for (const r of compRows) {
      if (r.type === 'cup' || r.type === 'continental') compTypeById.set(r.id, r.type);
      else compTypeById.set(r.id, 'league');
    }
  }

  const financeEntries: { clubId: number; season: number; week: number; type: string; amount: number; description: string }[] = [];
  const budgetByClub = new Map<number, number>();
  let updatedBudget = 0;

  for (const clubId of financeClubList) {
    const club = clubById.get(clubId);
    if (!club) continue;

    const homeFixture = fixtures.find(f => f.homeClubId === clubId);
    const hasHomeMatch = homeFixture != null;
    const actualAttendance = hasHomeMatch
      ? (resultByFixture.get(homeFixture!.id)?.attendance ?? homeFixture!.attendance ?? null)
      : null;
    const competitionType = hasHomeMatch
      ? (compTypeById.get(homeFixture!.competitionId) ?? 'league')
      : 'league';

    const fin = computeWeeklyClubFinance({
      clubId, reputation: club.reputation, budget: club.budget,
      stadiumCapacity: club.stadium_capacity, trainingFacilities: club.training_facilities,
      youthAcademy: club.youth_academy, medicalDepartment: club.medical_department,
      totalPlayerWages: playerWageByClub.get(clubId) ?? 0,
      totalStaffWages: staffWageByClub.get(clubId) ?? 0,
      hasHomeMatch, actualAttendance, leaguePosition: 1, competitionType,
    }, season, week);

    financeEntries.push(...fin.entries);
    let budget = fin.newBudget;

    // Human-only: monthly assistant wages every 4 weeks.
    if (clubId === playerClubId && saveId >= 0 && week % 4 === 0) {
      const assistants = await getAssistantsBySave(db, saveId);
      const totalAssistantWages = assistants.reduce((s, a) => s + a.wagePerMonth, 0);
      if (totalAssistantWages > 0) {
        financeEntries.push({
          clubId, season, week, type: 'assistant_wage',
          amount: -totalAssistantWages, description: 'Monthly assistant staff wages',
        });
        budget -= totalAssistantWages;
      }
    }

    budgetByClub.set(clubId, budget);
    if (clubId === playerClubId) updatedBudget = budget;
  }

  // One batched INSERT for every finance entry this week.
  if (financeEntries.length > 0) {
    const rowsSql = financeEntries.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
    const params: unknown[] = [];
    for (const e of financeEntries) params.push(saveId, e.clubId, e.season, e.week, e.type, e.amount, e.description);
    await db.prepare(
      `INSERT INTO club_finances (save_id, club_id, season, week, type, amount, description) VALUES ${rowsSql}`,
    ).run(...params);
  }

  // One batched budget UPDATE (CASE per club) instead of one per club.
  if (budgetByClub.size > 0) {
    const ids = [...budgetByClub.keys()];
    const caseSql = ids.map(() => 'WHEN ? THEN ?').join(' ');
    const caseParams: unknown[] = [];
    for (const id of ids) caseParams.push(id, budgetByClub.get(id));
    await db.prepare(
      `UPDATE clubs SET budget = CASE id ${caseSql} END WHERE save_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
    ).run(...caseParams, saveId, ...ids);
  }

  // Debt signal for board-stakes: consecutive weeks the human club stays in the red.
  const prevDebt = (await db
    .prepare('SELECT debt_weeks FROM clubs WHERE save_id = ? AND id = ?')
    .get(saveId, playerClubId)) as { debt_weeks: number } | undefined;
  const newDebtWeeks = updatedBudget < 0 ? (prevDebt?.debt_weeks ?? 0) + 1 : 0;
  await db
    .prepare('UPDATE clubs SET debt_weeks = ? WHERE save_id = ? AND id = ?')
    .run(newDebtWeeks, saveId, playerClubId);

  // 4b. Generate assistant comment (max 1 per week, 15% chance)
  let assistantComment: AssistantComment | null = null;
  if (saveId >= 0) {
    const assistants = await getAssistantsBySave(db, saveId);
    const commentRng = new SeededRng(saveId * season * (week + 1));
    for (const assistant of assistants) {
      const comment = maybeGenerateComment(assistant, {
        leaguePosition: null,
        totalTeams: 20,
        week,
        season,
        budgetBalance: updatedBudget,
        squadAvgAge: 26,
        topYouthPotential: null,
      }, commentRng);
      if (comment) { assistantComment = comment; break; }
    }
  }

  return { updatedBudget, assistantComment };
}
