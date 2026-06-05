import { DbHandle } from '@/database/queries/players';
import { addFinanceEntry } from '@/database/queries/finances';
import { calculateUpgradeCost, FacilityType } from './finance-engine';

const MAX_LEVEL = 5;

/** Maps FacilityType to the clubs table column name. */
const FACILITY_COLUMN: Record<Exclude<FacilityType, 'stadium'>, string> = {
  training: 'training_facilities',
  youth: 'youth_academy',
  medical: 'medical_department',
};

/** Human-readable label for each facility type. */
const FACILITY_LABEL: Record<FacilityType, string> = {
  stadium: 'Stadium',
  training: 'Training Facilities',
  youth: 'Youth Academy',
  medical: 'Medical Department',
};

export interface ApplyUpgradeResult {
  success: boolean;
  reason?: string;
  newLevel?: number;
  cost?: number;
}

/**
 * Apply a facility upgrade: debit budget, bump facility level, write ledger.
 *
 * Returns { success: false, reason } if the budget is insufficient or the
 * facility is already at MAX_LEVEL; otherwise returns { success: true, newLevel, cost }.
 */
export async function applyUpgrade(
  db: DbHandle,
  saveId: number,
  clubId: number,
  facilityType: FacilityType,
  currentLevel: number,
  season: number,
  week: number,
): Promise<ApplyUpgradeResult> {
  if (currentLevel >= MAX_LEVEL) {
    return { success: false, reason: 'Facility is already at maximum level' };
  }

  const { cost } = calculateUpgradeCost(facilityType, currentLevel);

  // Read current budget
  const clubRow = await db
    .prepare('SELECT budget FROM clubs WHERE save_id = ? AND id = ?')
    .get(saveId, clubId) as { budget: number } | undefined;

  if (!clubRow) {
    return { success: false, reason: 'Club not found' };
  }

  if (clubRow.budget < cost) {
    return { success: false, reason: 'Insufficient budget' };
  }

  const newLevel = Math.min(currentLevel + 1, MAX_LEVEL);

  // Debit budget
  await db
    .prepare('UPDATE clubs SET budget = budget - ? WHERE save_id = ? AND id = ?')
    .run(cost, saveId, clubId);

  // Bump facility level — stadium is handled separately (capacity-based) so only
  // training / youth / medical have a direct integer column.
  if (facilityType !== 'stadium') {
    const column = FACILITY_COLUMN[facilityType as Exclude<FacilityType, 'stadium'>];
    await db
      .prepare(`UPDATE clubs SET ${column} = MIN(${MAX_LEVEL}, ${column} + 1) WHERE save_id = ? AND id = ?`)
      .run(saveId, clubId);
  }

  // Write ledger entry
  await addFinanceEntry(db, saveId, {
    clubId,
    season,
    week,
    type: 'upgrade',
    amount: -cost,
    description: `${FACILITY_LABEL[facilityType]} upgrade to level ${newLevel}`,
  });

  return { success: true, newLevel, cost };
}
