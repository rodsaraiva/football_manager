import { Mentality, Pressing } from '@/types/tactic';
import { TextDescriptor } from '@/i18n/translate';

/** Que tipo de janela ao vivo o usuário está vendo. */
export type LiveWindowKind = 'halftime' | 'second_half' | 'final_stretch';

/** Gatilhos opt-in que podem abrir uma janela extra no 2º tempo. */
export type LiveTrigger = 'conceded_goal' | 'final_stretch';

export type MatchAdviceKind =
  | 'change_mentality'
  | 'change_pressing'
  | 'sub_off'        // tirar um jogador (cartão amarelo / fadiga alta)
  | 'sub_attacker'   // reforço ofensivo (correr atrás do placar)
  | 'sub_defender'   // reforço defensivo (proteger o placar)
  | 'hold';          // sem ação: "está bom, mantenha"

/** Conselho do assistente. `text` é i18n (igual a AssistantComment.comment). */
export interface MatchAdvice {
  kind: MatchAdviceKind;
  text: TextDescriptor;
  priority: number; // 0..100, lista ordenada desc
  suggestedMentality?: Mentality;
  suggestedPressing?: Pressing;
  suggestedSubOutId?: number;
  suggestedSubInId?: number;
}
