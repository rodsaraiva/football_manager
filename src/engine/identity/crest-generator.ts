import { SeededRng } from '@/engine/rng';

export interface CrestPath {
  d: string;
  fill: string;
}

export interface Crest {
  viewBox: string;
  paths: CrestPath[];
}

export function generateCrest(_rng: SeededRng): Crest {
  return { viewBox: '0 0 100 120', paths: [] };
}
