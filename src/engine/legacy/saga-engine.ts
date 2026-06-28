import { SeasonSaga, SeasonSagaArchetype } from '@/types/legacy';

export interface SagaInput {
  season: number; leaguePosition: number | null; totalTeams: number;
  expectedPosition: number | null;
  wonLeague: boolean; wonCup: boolean; wasPromoted: boolean; wasRelegated: boolean; trophies: number;
}

function pickArchetype(i: SagaInput): SeasonSagaArchetype {
  if (i.wonLeague && i.trophies >= 2) return 'historic_title';
  if (i.wasRelegated) return 'relegated';
  if (i.wasPromoted) return 'promotion';
  if (i.wonLeague || i.leaguePosition === 2) return 'title_race';
  if (i.expectedPosition != null && i.leaguePosition != null) {
    if (i.leaguePosition + 3 <= i.expectedPosition) return 'overachieved';
    if (i.leaguePosition >= i.expectedPosition + 4) return 'underachieved';
  }
  if (i.leaguePosition != null && i.leaguePosition > i.totalTeams * 0.75) return 'relegation_fight';
  if (i.leaguePosition != null && i.leaguePosition <= i.totalTeams * 0.4) return 'transition';
  return 'rebuild';
}

export function classifySeasonSaga(input: SagaInput): SeasonSaga {
  const archetype = pickArchetype(input);
  return {
    season: input.season,
    archetype,
    titleKey: `saga.${archetype}.title`,
    bodyKey: `saga.${archetype}.body`,
    vars: {
      season: input.season,
      position: input.leaguePosition ?? 0,
      totalTeams: input.totalTeams,
      trophies: input.trophies,
    },
  };
}
