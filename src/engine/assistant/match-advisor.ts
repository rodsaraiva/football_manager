import { AssistantArchetype } from '@/types/assistant';
import { PlayerForStrength } from '@/engine/simulation/team-strength';
import { Tactic, Mentality, Pressing } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';
import { MatchAdvice, MatchAdviceKind } from '@/types/match-advice';
import { TextDescriptor, TKey } from '@/i18n/translate';
import { ADVICE_LEAD_COMFORTABLE, ADVICE_FATIGUE_HIGH } from '@/engine/balance';

export interface MatchAdviceInput {
  archetype: AssistantArchetype;
  qualityStars: number;
  userGoals: number;
  oppGoals: number;
  currentBlock: number;
  userTactic: Tactic;
  onPitch: PlayerForStrength[];
  bench: PlayerForStrength[];
  yellowCardedIds: ReadonlySet<number>;
  fatigueByPlayer: ReadonlyMap<number, number>;
  subsRemaining: number;
  opponentName: string;
  rng: SeededRng;
}

const ATTACK_POS = new Set<string>(['ST', 'LW', 'RW', 'CAM']);
const DEFENSE_POS = new Set<string>(['CB', 'LB', 'RB']);

// Arquétipos que tendem a defender (segurar placar) vs empurrar pra frente.
// Modula só a PRIORIDADE/voz, nunca inverte a leitura de placar.
const CAUTIOUS: AssistantArchetype[] = ['tactician', 'pragmatic', 'old_school'];

// Texto i18n por (kind, arquétipo). Chaves em advice.* (pt/en paridade).
function adviceText(kind: MatchAdviceKind, archetype: AssistantArchetype): TextDescriptor {
  return { key: `advice.${kind}.${archetype}` as TKey };
}

/** Acha um reforço no banco por papel (def/atk); fallback = primeiro do banco. */
function pickBenchByRole(bench: PlayerForStrength[], roles: Set<string>): PlayerForStrength | null {
  return bench.find(p => roles.has(p.position)) ?? bench[0] ?? null;
}

export function generateMatchAdvice(input: MatchAdviceInput): MatchAdvice[] {
  const {
    archetype, qualityStars, userGoals, oppGoals, currentBlock, userTactic,
    onPitch, bench, yellowCardedIds, fatigueByPlayer, subsRemaining, rng,
  } = input;

  const diff = userGoals - oppGoals;          // >0 vencendo, <0 perdendo
  const late = currentBlock >= 22;            // 2º tempo / reta final
  const cautious = CAUTIOUS.includes(archetype);
  const canSub = subsRemaining > 0 && bench.length > 0;
  const out: MatchAdvice[] = [];

  // 1) Sub por cartão amarelo + fadiga alta (proteção contra 2º amarelo / queda física).
  if (canSub) {
    const risky = onPitch.find(p =>
      (yellowCardedIds.has(p.id) && late) ||
      (fatigueByPlayer.get(p.id) ?? 0) >= ADVICE_FATIGUE_HIGH,
    );
    if (risky) {
      const roles = DEFENSE_POS.has(risky.position) ? DEFENSE_POS : ATTACK_POS;
      const samePos = bench.filter(b => b.position === risky.position);
      const inn = pickBenchByRole(samePos.length ? samePos : bench, roles);
      out.push({
        kind: 'sub_off', text: adviceText('sub_off', archetype),
        priority: yellowCardedIds.has(risky.id) ? 90 : 70,
        suggestedSubOutId: risky.id, suggestedSubInId: inn?.id,
      });
    }
  }

  // 2) Leitura de placar.
  if (diff >= ADVICE_LEAD_COMFORTABLE) {
    // Vencendo confortável → segurar.
    if (userTactic.mentality !== 'defensive') {
      out.push({
        kind: 'change_mentality', text: adviceText('change_mentality', archetype),
        priority: cautious ? 80 : 55, suggestedMentality: 'defensive',
      });
    }
    if (canSub) {
      const inn = pickBenchByRole(bench, DEFENSE_POS);
      const offCand = onPitch.find(pp => ATTACK_POS.has(pp.position));
      if (inn && offCand) out.push({
        kind: 'sub_defender', text: adviceText('sub_defender', archetype),
        priority: cautious ? 75 : 50, suggestedSubOutId: offCand.id, suggestedSubInId: inn.id,
      });
    }
    out.push({ kind: 'hold', text: adviceText('hold', archetype), priority: 30 });
  } else if (diff <= -1) {
    // Perdendo → atacar.
    if (userTactic.mentality !== 'attacking') {
      out.push({
        kind: 'change_mentality', text: adviceText('change_mentality', archetype),
        priority: cautious ? 65 : 85, suggestedMentality: 'attacking' as Mentality,
      });
    }
    if (canSub) {
      const inn = pickBenchByRole(bench, ATTACK_POS);
      const offCand = onPitch.find(pp => DEFENSE_POS.has(pp.position));
      if (inn && offCand) out.push({
        kind: 'sub_attacker', text: adviceText('sub_attacker', archetype),
        priority: cautious ? 70 : 88, suggestedSubOutId: offCand.id, suggestedSubInId: inn.id,
      });
    }
    if (userTactic.pressing !== 'high') out.push({
      kind: 'change_pressing', text: adviceText('change_pressing', archetype),
      priority: 45, suggestedPressing: 'high' as Pressing,
    });
  } else {
    // Empate / vantagem mínima → ajuste leve + hold.
    out.push({ kind: 'hold', text: adviceText('hold', archetype), priority: 40 });
    if (diff === 1 && cautious && userTactic.mentality === 'attacking') out.push({
      kind: 'change_mentality', text: adviceText('change_mentality', archetype),
      priority: 50, suggestedMentality: 'balanced' as Mentality,
    });
  }

  // 3) Ordenar por prioridade (desc). Desempate determinístico via rng (avança o stream).
  out.sort((a, b) => b.priority - a.priority || (rng.next() - 0.5));

  // 4) qualityStars limita o tamanho da lista (assistente fraco vê menos opções).
  const cap = Math.max(1, Math.min(out.length, qualityStars));
  return out.slice(0, cap);
}
