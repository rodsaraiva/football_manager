import { Position, PlayerAttributes } from '@/types';
import { calculateOverall } from '@/utils/overall';
import { formationToSlots } from '../formations';
import { PlayerForStrength } from './team-strength';

export interface PlayerForPick {
  id: number;
  position: Position;
  secondaryPosition: Position | null;
  attributes: PlayerAttributes;
  morale: number;
  fitness: number;
  injuryWeeksLeft: number;
  suspensionWeeksLeft: number;
}

export const POSITION_GROUP: Record<string, string> = {
  GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'FWD', RW: 'FWD', ST: 'FWD',
};

// A player is selectable when fit, not injured and not suspended.
function isEligible(p: PlayerForPick): boolean {
  return p.fitness > 30 && p.injuryWeeksLeft === 0 && p.suspensionWeeksLeft === 0;
}

function toStrength(p: PlayerForPick, position: Position): PlayerForStrength {
  return {
    id: p.id,
    position,
    secondaryPosition: p.secondaryPosition,
    attributes: p.attributes,
    morale: p.morale,
    fitness: p.fitness,
  };
}

export function pickStartingEleven(players: PlayerForPick[], formation: string): PlayerForStrength[] {
  const slots = formationToSlots(formation);
  const selected = new Set<number>();
  const eleven: PlayerForStrength[] = [];

  for (const slot of slots) {
    const targetGroup = POSITION_GROUP[slot] ?? 'MID';
    const candidates = players
      .filter(p => !selected.has(p.id) && isEligible(p))
      .map(p => {
        const base = calculateOverall(p.attributes, slot);
        let bonus = 0;
        if (p.position === slot) bonus = 15;
        else if (p.secondaryPosition === slot) bonus = 8;
        else if (POSITION_GROUP[p.position] === targetGroup) bonus = 3;
        else if (slot === 'GK' && p.position !== 'GK') bonus = -30;
        else if (p.position === 'GK' && slot !== 'GK') bonus = -30;
        else bonus = -10;
        return { player: p, score: base + bonus };
      })
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      const pick = candidates[0].player;
      selected.add(pick.id);
      eleven.push(toStrength(pick, slot));
    }
  }

  return eleven;
}

export function buildSquadFromSavedIds(
  savedIds: number[],
  rawPlayers: PlayerForPick[],
  formation: string,
): PlayerForStrength[] {
  const byId = new Map(rawPlayers.map(p => [p.id, p]));
  const slots = formationToSlots(formation);
  const result: PlayerForStrength[] = [];
  const usedIds = new Set<number>();
  for (let i = 0; i < slots.length; i++) {
    const pid = savedIds[i];
    const p = pid != null ? byId.get(pid) : undefined;
    if (p && isEligible(p) && !usedIds.has(p.id)) {
      usedIds.add(p.id);
      result.push(toStrength(p, slots[i]));
    } else {
      // fallback: best available for this slot
      const fallback = rawPlayers
        .filter(q => !usedIds.has(q.id) && isEligible(q))
        .sort((a, b) => {
          const target = POSITION_GROUP[slots[i]] ?? 'MID';
          const scoreA = calculateOverall(a.attributes, slots[i]) + (a.position === slots[i] ? 15 : POSITION_GROUP[a.position] === target ? 3 : -10);
          const scoreB = calculateOverall(b.attributes, slots[i]) + (b.position === slots[i] ? 15 : POSITION_GROUP[b.position] === target ? 3 : -10);
          return scoreB - scoreA;
        })[0];
      if (fallback) {
        usedIds.add(fallback.id);
        result.push(toStrength(fallback, slots[i]));
      }
    }
  }
  return result;
}

export function buildBenchFromSavedIds(
  savedIds: number[],
  rawPlayers: PlayerForPick[],
  startIds: Set<number>,
): PlayerForStrength[] {
  const byId = new Map(rawPlayers.map(p => [p.id, p]));
  return savedIds
    .map(id => byId.get(id))
    .filter((p): p is PlayerForPick => p != null && !startIds.has(p.id) && isEligible(p))
    .slice(0, 8)
    .map(p => toStrength(p, p.position));
}

// Non-saved bench: best available eligible players not already starting, cap 8.
export function buildBench(rawPlayers: PlayerForPick[], startIds: Set<number>): PlayerForStrength[] {
  return rawPlayers
    .filter(p => !startIds.has(p.id) && isEligible(p))
    .slice(0, 8)
    .map(p => toStrength(p, p.position));
}
