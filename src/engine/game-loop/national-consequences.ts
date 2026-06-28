import { DbHandle } from '@/database/queries/players';
import { MatchResult } from '@/engine/simulation/match-engine';
import { getManagerReputation, setManagerReputation } from '@/database/queries/save';
import { incrementCaps, addGoals } from '@/database/queries/national-caps';
import { computeNationalReputationDelta } from '@/engine/board/manager-reputation-engine';
import { NationalLineup } from './national-lineup';

// Todo tipo de evento que incrementa o placar no match engine (open play + bola parada).
const SCORING_EVENTS = new Set(['goal', 'penalty_scored', 'free_kick_scored']);

// L1-D: consequências de carreira de UMA partida real da seleção DIRIGIDA pelo usuário.
// Acumula caps (titulares), gols (scorers reais) e move a reputação do técnico pelo
// resultado. Só é chamado no ramo da seleção do usuário — rivais abstratos nunca chegam
// aqui, então nada de prestígio/caps por jogos de terceiros. Determinístico (sem RNG).
export async function recordUserNationMatch(
  db: DbHandle,
  saveId: number,
  userIsHome: boolean,
  lineup: NationalLineup,
  result: MatchResult,
): Promise<void> {
  // Caps: +1 para cada TITULAR do XI da seleção do usuário.
  await incrementCaps(db, saveId, lineup.squad.map((p) => p.id));

  // Gols: a partir dos match events reais, creditados a quem está na convocação do usuário
  // (titular ou reserva que entrou). Conta TODO evento que soma ao placar — bola rolando,
  // pênalti e falta direta. Scorers do rival ficam de fora pelo filtro de ids.
  const userIds = new Set([...lineup.squad, ...lineup.bench].map((p) => p.id));
  const goalsByPlayer = new Map<number, number>();
  for (const e of result.events) {
    if (SCORING_EVENTS.has(e.type) && userIds.has(e.playerId)) {
      goalsByPlayer.set(e.playerId, (goalsByPlayer.get(e.playerId) ?? 0) + 1);
    }
  }
  for (const [pid, goals] of goalsByPlayer) await addGoals(db, saveId, pid, goals);

  // Reputação do técnico: vitória/derrota da seleção do usuário (empate é neutro).
  const userGoals = userIsHome ? result.homeGoals : result.awayGoals;
  const oppGoals = userIsHome ? result.awayGoals : result.homeGoals;
  const outcome: 'win' | 'draw' | 'loss' =
    userGoals > oppGoals ? 'win' : userGoals < oppGoals ? 'loss' : 'draw';
  const current = await getManagerReputation(db, saveId);
  const { next } = computeNationalReputationDelta({ current, outcome });
  if (next !== current) await setManagerReputation(db, saveId, next);
}

// L1-D: bônus de prestígio por vencer o torneio com a seleção dirigida. Chamado uma única
// vez (no registro idempotente do campeão), só quando o campeão é a seleção do usuário.
export async function applyUserNationTitleReputation(db: DbHandle, saveId: number): Promise<void> {
  const current = await getManagerReputation(db, saveId);
  const { next } = computeNationalReputationDelta({ current, wonTitle: true });
  if (next !== current) await setManagerReputation(db, saveId, next);
}
