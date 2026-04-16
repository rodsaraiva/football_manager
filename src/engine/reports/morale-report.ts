/**
 * Índice de Moral do Elenco.
 *
 * Pure function: takes a squad snapshot and returns aggregate morale insights.
 */
import { Position } from '@/types';
import { SquadPlayer } from './technical-report';

export interface MoraleEntry {
  playerId: number;
  playerName: string;
  position: Position;
  morale: number;
}

export interface MoraleReport {
  avgMorale: number;
  topMorale: MoraleEntry[];
  bottomMorale: MoraleEntry[];
  /** 'ok' >= 70, 'warning' 50-69, 'critical' < 50 */
  alertLevel: 'ok' | 'warning' | 'critical';
}

export function buildMoraleReport(squad: SquadPlayer[]): MoraleReport {
  if (squad.length === 0) {
    return {
      avgMorale: 0,
      topMorale: [],
      bottomMorale: [],
      alertLevel: 'ok',
    };
  }

  const withMorale = squad.filter((p) => p.morale != null);

  if (withMorale.length === 0) {
    return {
      avgMorale: 0,
      topMorale: [],
      bottomMorale: [],
      alertLevel: 'ok',
    };
  }

  const avg = Math.round(
    withMorale.reduce((sum, p) => sum + (p.morale ?? 0), 0) / withMorale.length,
  );

  const alertLevel: MoraleReport['alertLevel'] =
    avg < 50 ? 'critical' : avg < 70 ? 'warning' : 'ok';

  const sorted = [...withMorale].sort((a, b) => {
    const diff = (b.morale ?? 0) - (a.morale ?? 0);
    if (diff !== 0) return diff;
    return a.position.localeCompare(b.position);
  });

  const toEntry = (p: SquadPlayer): MoraleEntry => ({
    playerId: p.id,
    playerName: p.name,
    position: p.position,
    morale: p.morale ?? 0,
  });

  const topMorale = sorted.slice(0, 3).map(toEntry);
  const bottomMorale = [...sorted].reverse().slice(0, 3).map(toEntry);

  return { avgMorale: avg, topMorale, bottomMorale, alertLevel };
}
