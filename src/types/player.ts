export type Position = 'GK' | 'CB' | 'LB' | 'RB' | 'CDM' | 'CM' | 'CAM' | 'LM' | 'RM' | 'LW' | 'RW' | 'ST';

export interface PlayerAttributes {
  // Technical (7)
  finishing: number;
  passing: number;
  crossing: number;
  dribbling: number;
  heading: number;
  longShots: number;
  freeKicks: number;
  // Mental (6)
  vision: number;
  composure: number;
  decisions: number;
  positioning: number;
  aggression: number;
  leadership: number;
  // Physical (5)
  pace: number;
  stamina: number;
  strength: number;
  agility: number;
  jumping: number;
}

export type Foot = 'right' | 'left';

export interface Player {
  id: number;
  name: string;
  nationality: string;
  age: number;
  position: Position;
  secondaryPosition: Position | null;
  clubId: number | null;
  wage: number;
  contractEnd: number;
  marketValue: number;
  basePotential: number;
  effectivePotential: number;
  morale: number;
  fitness: number;
  injuryWeeksLeft: number;
  suspensionWeeksLeft: number;
  isFreeAgent: boolean;
  preferredFoot: Foot;
  weakFootAbility: number; // 1-5
  isTransferListed: boolean;
  isLoanListed: boolean;
  askingPrice: number | null;
  loanWageShare: number | null;
  loanWage: number | null;
  consecutiveLowMoraleWeeks: number;
  willRetireAtSeasonEnd: boolean;
}

export interface PlayerStats {
  playerId: number;
  season: number;
  competitionId: number;
  appearances: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  avgRating: number;
  minutesPlayed: number;
}
