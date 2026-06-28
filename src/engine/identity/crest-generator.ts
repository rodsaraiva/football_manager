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

// Divisória vertical do escudo (heráldica "per pale"): metade direita em 2ª cor.
function dexterHalfPath(): string {
  const cx = VIEW_W / 2, x1 = VIEW_W - 6, top = 8, mid = 70, tip = VIEW_H - 6;
  return [
    `M${fmt(cx)} ${fmt(top)}`,
    `L${fmt(x1)} ${fmt(top)}`,
    `L${fmt(x1)} ${fmt(mid)}`,
    `Q${fmt(x1)} ${fmt(mid + 28)} ${fmt(cx)} ${fmt(tip)}`,
    'Z',
  ].join(' ');
}

// Chefe (faixa horizontal no topo do escudo).
function chiefPath(): string {
  const x0 = 6, x1 = VIEW_W - 6, top = 8, band = 30;
  return [
    `M${fmt(x0)} ${fmt(top)}`,
    `L${fmt(x1)} ${fmt(top)}`,
    `L${fmt(x1)} ${fmt(band)}`,
    `L${fmt(x0)} ${fmt(band)}`,
    'Z',
  ].join(' ');
}

// Estrela central de 5 pontas (charge).
function starPath(cx: number, cy: number, rOuter: number): string {
  const rInner = rOuter * 0.42;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const ang = -Math.PI / 2 + (Math.PI * i) / 5;
    pts.push(`${fmt(cx + r * Math.cos(ang))} ${fmt(cy + r * Math.sin(ang))}`);
  }
  return `M${pts.join(' L')} Z`;
}

export function generateCrest(rng: SeededRng): Crest {
  const base = rng.pick(PALETTE);
  const second = rng.pick(PALETTE);
  const metal = rng.pick(PALETTE);

  const paths: CrestPath[] = [{ d: shieldPath(), fill: base }];

  // Divisão heráldica: 'plain' | 'per-pale' | 'chief'.
  const division = rng.weightedPick(['plain', 'per-pale', 'chief'] as const, [3, 4, 3]);
  if (division === 'per-pale') {
    paths.push({ d: dexterHalfPath(), fill: second });
  } else if (division === 'chief') {
    paths.push({ d: chiefPath(), fill: second });
  }

  // Charge central (estrela) presente em ~60% dos escudos.
  if (rng.next() < 0.6) {
    paths.push({ d: starPath(VIEW_W / 2, 42, 14), fill: metal });
  }

  return { viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, paths };
}
