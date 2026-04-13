import { SeededRng } from '@/engine/rng';
import { PlayerAttributes, Position } from '@/types';

export interface YouthGenerationInput {
  clubId: number;
  academyLevel: number;    // 1-5
  youthCoachBonus: number; // 0-10 (from staff effects)
  countryCode: string;
  rng: SeededRng;
}

export interface YouthPlayer {
  name: string;
  age: number;
  position: Position;
  attributes: PlayerAttributes;
  basePotential: number;
  currentOverall: number;
}

// Name pools by country code (first names, last names)
const NAME_POOLS: Record<string, { first: string[]; last: string[] }> = {
  EN: {
    first: ['James', 'Oliver', 'Harry', 'Jack', 'George', 'Charlie', 'Noah', 'Alfie', 'Freddie', 'Oscar', 'Ethan', 'Logan', 'Mason', 'Lucas', 'Liam'],
    last: ['Smith', 'Jones', 'Williams', 'Taylor', 'Brown', 'Davies', 'Evans', 'Wilson', 'Thomas', 'Roberts', 'Johnson', 'White', 'Lewis', 'Walker', 'Hall'],
  },
  ES: {
    first: ['Pablo', 'Sergio', 'Alejandro', 'Carlos', 'Javier', 'Miguel', 'Andres', 'Diego', 'Fernando', 'Raul', 'Ivan', 'Marcos', 'Adrian', 'Daniel', 'Juan'],
    last: ['Garcia', 'Martinez', 'Lopez', 'Sanchez', 'Gonzalez', 'Perez', 'Rodriguez', 'Fernandez', 'Torres', 'Moreno', 'Jimenez', 'Ruiz', 'Diaz', 'Hernandez', 'Alvarez'],
  },
  DE: {
    first: ['Lukas', 'Jonas', 'Leon', 'Finn', 'Elias', 'Ben', 'Felix', 'Paul', 'Moritz', 'Julian', 'Tim', 'Jan', 'Nico', 'Tobias', 'Simon'],
    last: ['Muller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Bauer', 'Klein', 'Wolf'],
  },
  BR: {
    first: ['Gabriel', 'Lucas', 'Mateus', 'Guilherme', 'Rafael', 'Thiago', 'Bruno', 'Rodrigo', 'Felipe', 'Pedro', 'Andre', 'Diego', 'Carlos', 'Eduardo', 'Victor'],
    last: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Araujo'],
  },
  FR: {
    first: ['Antoine', 'Hugo', 'Lucas', 'Maxime', 'Thomas', 'Nicolas', 'Theo', 'Clement', 'Romain', 'Baptiste', 'Jules', 'Alexis', 'Florian', 'Julien', 'Kevin'],
    last: ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia'],
  },
};

const DEFAULT_NAME_POOL = NAME_POOLS['EN'];

const POSITIONS: Position[] = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
const POSITION_WEIGHTS = [2, 4, 3, 3, 4, 5, 4, 3, 3, 4, 4, 5];

// Attributes boosted per position group
const POSITION_BOOSTS: Record<string, (keyof PlayerAttributes)[]> = {
  GK: ['composure', 'decisions', 'positioning', 'jumping', 'strength'],
  CB: ['heading', 'strength', 'positioning', 'aggression', 'jumping'],
  LB: ['crossing', 'pace', 'stamina', 'agility', 'passing'],
  RB: ['crossing', 'pace', 'stamina', 'agility', 'passing'],
  CDM: ['positioning', 'aggression', 'stamina', 'strength', 'decisions'],
  CM: ['passing', 'vision', 'stamina', 'decisions', 'composure'],
  CAM: ['passing', 'vision', 'dribbling', 'freeKicks', 'composure'],
  LM: ['crossing', 'pace', 'dribbling', 'agility', 'stamina'],
  RM: ['crossing', 'pace', 'dribbling', 'agility', 'stamina'],
  LW: ['dribbling', 'pace', 'agility', 'finishing', 'longShots'],
  RW: ['dribbling', 'pace', 'agility', 'finishing', 'longShots'],
  ST: ['finishing', 'heading', 'composure', 'strength', 'positioning'],
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function generateAttributes(rng: SeededRng, position: Position, base: number): PlayerAttributes {
  const attrKeys: (keyof PlayerAttributes)[] = [
    'finishing', 'passing', 'crossing', 'dribbling', 'heading', 'longShots', 'freeKicks',
    'vision', 'composure', 'decisions', 'positioning', 'aggression', 'leadership',
    'pace', 'stamina', 'strength', 'agility', 'jumping',
  ];

  const boosts = new Set(POSITION_BOOSTS[position] ?? []);
  const attrs: Partial<PlayerAttributes> = {};

  for (const key of attrKeys) {
    const variance = rng.nextInt(-10, 10);
    const boost = boosts.has(key) ? rng.nextInt(5, 8) : 0;
    attrs[key] = clamp(base + variance + boost, 1, 99);
  }

  return attrs as PlayerAttributes;
}

function generateName(rng: SeededRng, countryCode: string): string {
  const pool = NAME_POOLS[countryCode] ?? DEFAULT_NAME_POOL;
  const first = rng.pick(pool.first);
  const last = rng.pick(pool.last);
  return `${first} ${last}`;
}

export function generateYouthPlayers(input: YouthGenerationInput): YouthPlayer[] {
  const { academyLevel, youthCoachBonus, countryCode, rng } = input;

  // Count: academyLevel + rng.nextInt(-1, 0) clamped to [2, 5]
  const rawCount = academyLevel + rng.nextInt(-1, 0);
  const count = clamp(rawCount, 2, 5);

  const players: YouthPlayer[] = [];

  for (let i = 0; i < count; i++) {
    const age = rng.nextInt(16, 18);

    const position = rng.weightedPick(POSITIONS, POSITION_WEIGHTS);

    // basePotential: 40 + academyLevel * 8 + youthCoachBonus + rng.nextInt(-5, 10), clamped [45, 95]
    const rawPotential = 40 + academyLevel * 8 + youthCoachBonus + rng.nextInt(-5, 10);
    const basePotential = clamp(rawPotential, 45, 95);

    // currentOverall: basePotential - rng.nextInt(10, 20), clamped [30, 70]
    const rawOverall = basePotential - rng.nextInt(10, 20);
    const currentOverall = clamp(rawOverall, 30, 70);

    const attributes = generateAttributes(rng, position, currentOverall);

    const name = generateName(rng, countryCode);

    players.push({ name, age, position, attributes, basePotential, currentOverall });
  }

  return players;
}
