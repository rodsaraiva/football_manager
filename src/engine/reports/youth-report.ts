/**
 * Analista Sub-21.
 *
 * Focus exclusively on players aged <= 21 — deeper view of each prospect:
 * potential gap, internal ranking among U21s, and comparison to the current
 * starter at the same position.
 */
import { SquadPlayer, PlayerForm, computeForm, FormInput } from './technical-report';

export const U21_AGE_LIMIT = 21;

export interface YouthListItem {
  player: SquadPlayer;
  form: PlayerForm;
  potentialGap: number; // effectivePotential - overall
  starterComparison: {
    starterId: number;
    starterName: string;
    starterOverall: number;
    overallDelta: number; // youth.overall - starter.overall
  } | null;
  insight: string;
}

export interface YouthReport {
  topProspects: YouthListItem[];
  mostUnderused: YouthListItem[];
  biggestGaps: YouthListItem[]; // most room to grow
}

function pickStarterFor(
  squad: SquadPlayer[],
  position: string,
  excludeId: number,
): SquadPlayer | null {
  const candidates = squad.filter(
    (p) => p.position === position && p.id !== excludeId && p.injuryWeeksLeft === 0,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, cur) => (cur.overall > best.overall ? cur : best), candidates[0]);
}

export function buildYouthReport(input: FormInput): YouthReport {
  const { squad } = input;
  const youths = squad.filter((p) => p.age <= U21_AGE_LIMIT);
  if (youths.length === 0) {
    return { topProspects: [], mostUnderused: [], biggestGaps: [] };
  }

  const forms = computeForm(input);
  const formById = new Map<number, PlayerForm>(forms.map((f) => [f.playerId, f]));

  const items: YouthListItem[] = youths.map((p) => {
    const form = formById.get(p.id) ?? {
      playerId: p.id,
      appearances: 0,
      avgRating: 0,
      goals: 0,
      assists: 0,
    };
    const starter = pickStarterFor(squad, p.position, p.id);
    const starterComparison = starter
      ? {
          starterId: starter.id,
          starterName: starter.name,
          starterOverall: starter.overall,
          overallDelta: p.overall - starter.overall,
        }
      : null;

    const potentialGap = p.effectivePotential - p.overall;

    // Build a human insight about this prospect
    let insight = '';
    if (form.appearances === 0 && starter && p.overall >= starter.overall - 5) {
      insight = `Não jogou nas últimas partidas mas está só ${Math.abs(p.overall - starter.overall)} pontos abaixo do titular (${starter.name}) — merece uma chance.`;
    } else if (form.avgRating >= 7.2 && form.appearances >= 2) {
      insight = `Em grande fase: ${form.avgRating.toFixed(1)} de média em ${form.appearances} jogos.`;
    } else if (potentialGap >= 10) {
      insight = `Potencial de crescimento alto (gap de ${potentialGap} pontos). Aposta para o futuro.`;
    } else if (form.appearances < 2 && form.appearances > 0) {
      insight = `Vem sendo usado pontualmente. Avaliar se dá para aumentar minutagem.`;
    } else {
      insight = `Jovem em desenvolvimento normal.`;
    }

    return { player: p, form, potentialGap, starterComparison, insight };
  });

  const topProspects = [...items]
    .sort((a, b) => b.player.overall + b.potentialGap * 0.4 - (a.player.overall + a.potentialGap * 0.4))
    .slice(0, 5);

  const mostUnderused = [...items]
    .filter((x) => x.form.appearances === 0 && x.player.overall >= 65)
    .sort((a, b) => b.player.overall - a.player.overall);

  const biggestGaps = [...items]
    .filter((x) => x.potentialGap >= 5)
    .sort((a, b) => b.potentialGap - a.potentialGap)
    .slice(0, 5);

  return { topProspects, mostUnderused, biggestGaps };
}
