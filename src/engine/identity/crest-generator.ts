import { SeededRng } from '@/engine/rng';

export interface CrestPath {
  d: string;
  fill: string;
}

export interface Crest {
  viewBox: string;
  paths: CrestPath[];
}

const VIEW_W = 100;
const VIEW_H = 120;

// Paleta determinística do escudo (independente do chrome). Tons profundos
// alinhados ao "Premium Imersivo" + metais para contraste.
const PALETTE = [
  '#1b2a4a', '#27486f', '#3a6ea5', '#b03a2e', '#7d3c98',
  '#1e7a46', '#c9a227', '#d7dadd', '#0f1626', '#8a8d91',
] as const;

function fmt(n: number): string {
  return n.toFixed(1);
}

// Contorno de escudo "heater": ombros no topo, ponta na base.
function shieldPath(): string {
  const x0 = 6, x1 = VIEW_W - 6, top = 8, mid = 70, tip = VIEW_H - 6;
  const cx = VIEW_W / 2;
  return [
    `M${fmt(x0)} ${fmt(top)}`,
    `L${fmt(x1)} ${fmt(top)}`,
    `L${fmt(x1)} ${fmt(mid)}`,
    `Q${fmt(x1)} ${fmt(mid + 28)} ${fmt(cx)} ${fmt(tip)}`,
    `Q${fmt(x0)} ${fmt(mid + 28)} ${fmt(x0)} ${fmt(mid)}`,
    'Z',
  ].join(' ');
}

export function generateCrest(rng: SeededRng): Crest {
  const base = rng.pick(PALETTE);
  const paths: CrestPath[] = [{ d: shieldPath(), fill: base }];
  return { viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, paths };
}
