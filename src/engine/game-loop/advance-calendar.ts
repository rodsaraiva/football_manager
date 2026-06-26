import { updateSaveWeek } from '@/database/queries/saves';
import { WeekContext } from './week-context';

export interface CalendarDelta {
  newSeason: number;
  newWeek: number;
}

// Fase: avança o ponteiro de semana/temporada e persiste no save. Última fase do
// loop — roda depois de todas as mutações da semana.
export async function advanceCalendar(ctx: WeekContext, isSeasonEnd: boolean): Promise<CalendarDelta> {
  const { db, saveId, season, week } = ctx;

  const newWeek = isSeasonEnd ? 1 : week + 1;
  const newSeason = isSeasonEnd ? season + 1 : season;

  // Update save if valid saveId
  if (saveId >= 0) {
    await updateSaveWeek(db, saveId, newSeason, newWeek);
  }

  return { newSeason, newWeek };
}
