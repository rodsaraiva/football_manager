import { SeededRng } from '@/engine/rng';
import { PlayerAttributes, Position } from '@/types';
import { resolveIntakeCount, YouthSpecialization } from '@/engine/youth/youth-levers';

export interface YouthGenerationInput {
  clubId: number;
  academyLevel: number;    // 1-5
  youthCoachBonus: number; // 0-10 (from staff effects)
  academyReputation?: number;           // 1-100 (default 50)
  specialization?: YouthSpecialization; // default 'balanced'
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

const PHYSICAL_ATTRS: (keyof PlayerAttributes)[] = ['pace', 'stamina', 'strength', 'agility', 'jumping'];
const TECHNICAL_ATTRS: (keyof PlayerAttributes)[] = ['finishing', 'passing', 'crossing', 'dribbling', 'heading', 'longShots', 'freeKicks'];
const MENTAL_ATTRS: (keyof PlayerAttributes)[] = ['vision', 'composure', 'decisions', 'positioning', 'aggression', 'leadership'];

function specializationBoostSet(spec: YouthSpecialization, position: Position): Set<keyof PlayerAttributes> {
  switch (spec) {
    case 'physical': return new Set(PHYSICAL_ATTRS);
    case 'technical': return new Set(TECHNICAL_ATTRS);
    case 'mental': return new Set(MENTAL_ATTRS);
    case 'position': return new Set(POSITION_BOOSTS[position] ?? []);
    default: return new Set();
  }
}

function generateAttributes(
  rng: SeededRng, position: Position, base: number, spec: YouthSpecialization,
): PlayerAttributes {
  const attrKeys: (keyof PlayerAttributes)[] = [
    'finishing', 'passing', 'crossing', 'dribbling', 'heading', 'longShots', 'freeKicks',
    'vision', 'composure', 'decisions', 'positioning', 'aggression', 'leadership',
    'pace', 'stamina', 'strength', 'agility', 'jumping',
  ];

  const boosts = new Set(POSITION_BOOSTS[position] ?? []);
  const specBoosts = specializationBoostSet(spec, position);
  const attrs: Partial<PlayerAttributes> = {};

  for (const key of attrKeys) {
    const variance = rng.nextInt(-10, 10);
    const boost = boosts.has(key) ? rng.nextInt(5, 8) : 0;
    // Determinismo: rng.nextInt(3,6) só é consumido quando a chave está no grupo
    // da specialization; em 'balanced' o set é vazio e o stream fica idêntico ao legado.
    const specBoost = specBoosts.has(key) ? rng.nextInt(3, 6) : 0;
    attrs[key] = clamp(base + variance + boost + specBoost, 1, 99);
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
  const academyReputation = input.academyReputation ?? 50;
  const specialization = input.specialization ?? 'balanced';

  // Count via levers (espelha academyLevel + rng.nextInt(-1,0), clamp [2,5]).
  const count = resolveIntakeCount(
    { academyLevel, youthCoachBonus, academyReputation, specialization }, rng,
  );

  const players: YouthPlayer[] = [];

  for (let i = 0; i < count; i++) {
    const age = rng.nextInt(16, 18);

    const position = rng.weightedPick(POSITIONS, POSITION_WEIGHTS);

    // repBonus é puro (não consome rng) e é 0 para reputation=50, preservando o
    // stream legado. basePotential: 40 + academyLevel*8 + bonus + repBonus + rng.nextInt(-5,10).
    const repBonus = Math.round((academyReputation - 50) / 12);
    const rawPotential = 40 + academyLevel * 8 + youthCoachBonus + repBonus + rng.nextInt(-5, 10);
    const basePotential = clamp(rawPotential, 45, 95);

    // currentOverall: basePotential - rng.nextInt(10, 20), clamped [30, 70]
    const rawOverall = basePotential - rng.nextInt(10, 20);
    const currentOverall = clamp(rawOverall, 30, 70);

    const attributes = generateAttributes(rng, position, currentOverall, specialization);

    const name = generateName(rng, countryCode);

    players.push({ name, age, position, attributes, basePotential, currentOverall });
  }

  return players;
}
