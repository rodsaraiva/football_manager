export type CompetitionType = 'league' | 'cup' | 'continental';

export interface PrizeAward {
  clubId: number;
  amount: number;
  description: string;
}

/** League prize: scales with division (higher tier = more money) and final
 *  position (1st earns the most, falling linearly to a small floor for last). */
export function calculateLeaguePrize(input: {
  divisionLevel: number;
  finalPosition: number;
  numTeams: number;
}): number {
  const { divisionLevel, finalPosition, numTeams } = input;
  const divisionPot = 40_000_000 / Math.max(1, divisionLevel);
  const teams = Math.max(1, numTeams);
  const pos = Math.min(Math.max(1, finalPosition), teams);
  const share = 1 - ((pos - 1) / teams) * 0.95;
  return Math.round((divisionPot * share) / 100_000) * 100_000;
}

/** Cup / continental prize by outcome. Continental (CL) pays a premium. */
export function calculateCupPrize(input: {
  competitionType: 'cup' | 'continental';
  result: 'champion' | 'runner_up' | 'participant';
}): number {
  const base: Record<'champion' | 'runner_up' | 'participant', number> = {
    champion: 15_000_000,
    runner_up: 7_000_000,
    participant: 1_000_000,
  };
  const multiplier = input.competitionType === 'continental' ? 3 : 1;
  return base[input.result] * multiplier;
}

/** Per-home-match gate receipt multiplier. League = 1.0 baseline. */
export function gateReceiptMultiplier(competitionType: CompetitionType): number {
  switch (competitionType) {
    case 'continental':
      return 1.6;
    case 'cup':
      return 1.2;
    case 'league':
    default:
      return 1.0;
  }
}
