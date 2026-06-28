// Pure youth-prospect generator. Determinístico por (saveId, regionCode, slot, seed).
// No React/Expo/DB. Espelha o estilo de generateYouthPlayers (youth-academy.ts).
import { SeededRng } from '@/engine/rng';
import type { Position } from '@/types';

export interface YouthProspect {
  name: string;
  age: number; // 15–17
  position: Position;
  regionCode: string;
  basePotential: number;
  maskedPotentialLo: number;
  maskedPotentialHi: number;
}

const FIRST_NAMES = [
  'Luca', 'Mateo', 'Noah', 'Liam', 'Enzo', 'Gael', 'Theo', 'Aron',
  'Nico', 'Ravi', 'Yusuf', 'Kai', 'Diego', 'Bruno', 'Iker', 'Milan',
];
const LAST_NAMES = [
  'Silva', 'Costa', 'Moreau', 'Bauer', 'Rossi', 'Novak', 'Haas', 'Vidal',
  'Sousa', 'Klein', 'Lopes', 'Tavares', 'Fischer', 'Mendez', 'Cruz', 'Berg',
];
const POSITIONS: readonly Position[] = [
  'GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST',
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function generateYouthProspect(
  saveId: number,
  regionCode: string,
  slot: number,
  rng: SeededRng,
): YouthProspect {
  // saveId/regionCode/slot apenas modulam o stream do rng já semeado pelo caller,
  // garantindo prospectos distintos por slot sem rng global.
  const salt = saveId * 31 + slot * 7 + (regionCode.charCodeAt(0) || 0);
  for (let i = 0; i < salt % 5; i++) rng.next();

  const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
  const age = rng.nextInt(15, 17);
  const position = rng.pick(POSITIONS);
  const basePotential = clamp(50 + rng.nextInt(-5, 35), 45, 90);
  // Máscara: jovem pré-academia é muito incerto → janela larga ±12, clamp 1–99.
  const margin = 12;
  return {
    name,
    age,
    position,
    regionCode,
    basePotential,
    maskedPotentialLo: clamp(basePotential - margin, 1, 99),
    maskedPotentialHi: clamp(basePotential + margin, 1, 99),
  };
}
