/**
 * L2 Fase 2 — geometria derivada dos eventos da partida.
 *
 * INVARIANTE-MÃE (spec §8, Opção B): esta derivação roda DEPOIS de `simulateMatch`,
 * por fora da stream principal do jogo. Cada evento recebe um `SeededRng` PRÓPRIO,
 * semeado por (fixtureId, eventIndex). Nenhuma chamada a `rng.next()` aqui toca a
 * stream que produziu o placar — logo a geometria é totalmente independente e o
 * determinismo do motor fica byte-for-byte intacto.
 *
 * Convenção de coordenadas (campo normalizado):
 *  - x ∈ [0,1] = comprimento. x=0 é a linha de gol do MANDANTE, x=1 a do VISITANTE.
 *    Mandante ataca para x→1; visitante ataca para x→0.
 *  - y ∈ [0,1] = largura (câmera fixa). y=0 lateral esquerda, y=1 direita, 0.5 centro.
 */
import { MatchEvent, MatchEventType, Position } from '@/types';
import { AttackFocus, Tactic } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';
import { PlayerForStrength } from './team-strength';
import { MatchResult } from './match-engine';

export type GeometryPhase = 'open_play' | 'corner' | 'set_piece' | 'penalty';

export interface GeometricEvent {
  /** Índice do evento em `result.events` (alinhamento 1:1 e em ordem). */
  eventIndex: number;
  x: number; // [0,1]
  y: number; // [0,1]
  phase: GeometryPhase;
}

/**
 * Entrada mínima para a geometria. `MatchInput` é estruturalmente atribuível a
 * este tipo (tem todos estes campos), então testes podem passar o `MatchInput`
 * completo e a persistência pode montar um objeto leve sem `rng`/reputação.
 */
export interface MatchGeometryInput {
  fixtureId: number;
  homeSquad: PlayerForStrength[];
  awaySquad: PlayerForStrength[];
  homeTactic: Tactic;
  awayTactic: Tactic;
}

// RNG derivado: offset primo grande + passo primo por fixture + índice do evento.
// Garante streams disjuntas por (fixtureId, eventIndex) e reprodutibilidade total.
const GEOMETRY_SEED_OFFSET = 1000003;
const FIXTURE_STRIDE = 7919;

type Side = 'home' | 'away';

interface Actor {
  side: Side;
  position: Position;
}

// Distância subindo o campo a partir do PRÓPRIO gol, normalizada [0,1].
const LANE_BY_POSITION: Record<Position, number> = {
  GK: 0.05,
  CB: 0.22,
  LB: 0.28,
  RB: 0.28,
  CDM: 0.4,
  CM: 0.5,
  CAM: 0.66,
  LM: 0.62,
  RM: 0.62,
  LW: 0.75,
  RW: 0.75,
  ST: 0.84,
};

// Faixa lateral típica (câmera fixa): canhotos à esquerda, destros à direita.
const LATERAL_BY_POSITION: Record<Position, number> = {
  GK: 0.5,
  CB: 0.5,
  LB: 0.2,
  RB: 0.8,
  CDM: 0.5,
  CM: 0.5,
  CAM: 0.5,
  LM: 0.2,
  RM: 0.8,
  LW: 0.18,
  RW: 0.82,
  ST: 0.5,
};

const SHOT_TYPES = new Set<MatchEventType>(['goal', 'shot_on_target', 'shot_off_target']);
const PENALTY_TYPES = new Set<MatchEventType>(['penalty_scored', 'penalty_missed', 'penalty_shootout']);
const SET_PIECE_TYPES = new Set<MatchEventType>(['free_kick_scored', 'free_kick_missed']);

// Dispersão lateral do chute pelo foco de ataque do time do autor: pelas pontas
// abre a finalização; pelo meio aperta no centro.
const SHOT_WIDTH_BY_FOCUS: Record<AttackFocus, number> = {
  through_middle: 0.12,
  possession: 0.16,
  balanced: 0.2,
  counter_attack: 0.22,
  down_the_flanks: 0.3,
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Converte lane (distância do próprio gol) em x absoluto pelo lado do ator. */
function laneToX(lane: number, side: Side): number {
  return side === 'home' ? lane : 1 - lane;
}

function geometryForEvent(
  event: MatchEvent,
  actor: Actor | null,
  attackFocus: AttackFocus,
  rng: SeededRng,
): { x: number; y: number; phase: GeometryPhase } {
  const side: Side = actor?.side ?? 'home';
  const position = actor?.position ?? 'CM';

  // Defesa (goleiro): o lance acontece no PRÓPRIO gol do ator (GK defensor).
  if (event.type === 'save') {
    const lane = 0.04 + rng.nextFloat(0, 0.03);
    return { x: clamp01(laneToX(lane, side)), y: clamp01(0.5 + rng.nextFloat(-0.12, 0.12)), phase: 'open_play' };
  }

  if (PENALTY_TYPES.has(event.type)) {
    const lane = 0.885; // marca do pênalti
    return { x: clamp01(laneToX(lane, side)), y: clamp01(0.5 + rng.nextFloat(-0.04, 0.04)), phase: 'penalty' };
  }

  if (SET_PIECE_TYPES.has(event.type)) {
    const lane = 0.7 + rng.nextFloat(0, 0.12); // logo fora da área
    return { x: clamp01(laneToX(lane, side)), y: clamp01(0.5 + rng.nextFloat(-0.25, 0.25)), phase: 'set_piece' };
  }

  if (SHOT_TYPES.has(event.type)) {
    // Chute em jogo aberto: cai na área ofensiva, independente da posição do autor
    // (ex.: zagueiro cabeceando em escanteio também finaliza perto do gol adversário).
    const lane = 0.78 + rng.nextFloat(0, 0.17);
    const width = SHOT_WIDTH_BY_FOCUS[attackFocus] ?? 0.2;
    return { x: clamp01(laneToX(lane, side)), y: clamp01(0.5 + rng.nextFloat(-width, width)), phase: 'open_play' };
  }

  if (event.type === 'assist') {
    const lane = 0.6 + rng.nextFloat(0, 0.2);
    return { x: clamp01(laneToX(lane, side)), y: clamp01(rng.nextFloat(0.1, 0.9)), phase: 'open_play' };
  }

  // Eventos sem finalização (cartões, falta, lesão, substituição): posiciona pela
  // posição de campo típica do jogador, com leve dispersão.
  const lane = clamp01((LANE_BY_POSITION[position] ?? 0.5) + rng.nextFloat(-0.08, 0.08));
  const lat = clamp01((LATERAL_BY_POSITION[position] ?? 0.5) + rng.nextFloat(-0.1, 0.1));
  return { x: clamp01(laneToX(lane, side)), y: lat, phase: 'open_play' };
}

/**
 * Deriva a geometria de cada evento de `result.events`. PURA: não muta `result`
 * nem `input`. Saída paralela a `result.events` (mesma ordem, `eventIndex`).
 */
export function deriveMatchGeometry(result: MatchResult, input: MatchGeometryInput): GeometricEvent[] {
  const byId = new Map<number, Actor>();
  for (const p of input.homeSquad) byId.set(p.id, { side: 'home', position: p.position });
  for (const p of input.awaySquad) byId.set(p.id, { side: 'away', position: p.position });

  return result.events.map((event, eventIndex) => {
    const rng = new SeededRng(GEOMETRY_SEED_OFFSET + input.fixtureId * FIXTURE_STRIDE + eventIndex);
    const actor = byId.get(event.playerId) ?? null;
    const focus = (actor?.side === 'away' ? input.awayTactic : input.homeTactic).attackFocus;
    const { x, y, phase } = geometryForEvent(event, actor, focus, rng);
    return { eventIndex, x, y, phase };
  });
}
