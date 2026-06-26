import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { insertNewsItem } from '@/database/queries/news';
import { calculateOverall } from '@/utils/overall';
import {
  isInternationalBreak,
  selectCallUps,
  applyTravelFatigue,
  CallUpCandidate,
} from '@/engine/national/international-duty';
import { WeekContext } from './week-context';

// Fase: P9 convocações internacionais. Em semanas de janela FIFA os jogadores de
// nível internacional do clube humano são convocados e voltam com fadiga de viagem.
// Roda independente de ter havido fixture de liga (a janela é evento de calendário).
export async function internationalDuty(ctx: WeekContext): Promise<number[]> {
  const { db, saveId, season, week, playerClubId } = ctx;

  // 9c. Travel fatigue STACKS with any match fitness change applied above
  // (returning from internationals tired is realistic).
  const internationalCallUps: number[] = [];
  if (isInternationalBreak(week)) {
    const squad = await getPlayersWithAttributesByClub(db, saveId, playerClubId);
    const candidates: CallUpCandidate[] = squad
      .filter((p) => !p.isFreeAgent)
      .map((p) => ({
        id: p.id,
        nationality: p.nationality,
        overall: calculateOverall(p.attributes, p.position),
      }));
    const fitnessById = new Map(squad.map((p) => [p.id, p.fitness]));
    for (const id of selectCallUps(candidates)) {
      const current = fitnessById.get(id);
      if (current == null) continue;
      const next = applyTravelFatigue(current);
      await db.prepare('UPDATE players SET fitness = ? WHERE save_id = ? AND id = ?').run(next, saveId, id);
      internationalCallUps.push(id);
    }
    if (internationalCallUps.length > 0) {
      await insertNewsItem(db, saveId, {
        season, week, category: 'callup', icon: '🌍', priority: 75,
        titleKey: 'news.persist_callup_title',
        bodyKey: internationalCallUps.length === 1 ? 'news.persist_callup_body_one' : 'news.persist_callup_body_other',
        bodyVars: { count: internationalCallUps.length },
      });
    }
  }

  return internationalCallUps;
}
