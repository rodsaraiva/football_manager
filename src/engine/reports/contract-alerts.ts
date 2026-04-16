/**
 * Alerta de Contratos Vencendo.
 *
 * Pure function: identifies squad players with contracts expiring soon and
 * above a minimum overall threshold.
 */
import { SquadPlayer } from './technical-report';

export interface ContractAlert {
  player: SquadPlayer;
  contractEnd: number;
  /** 'critical' = vence na temporada atual, 'warning' = +1, 'watch' = +2 */
  urgency: 'critical' | 'warning' | 'watch';
}

const URGENCY_ORDER: Record<ContractAlert['urgency'], number> = {
  critical: 0,
  warning: 1,
  watch: 2,
};

const MIN_OVERALL = 70;
const MAX_SEASONS_AHEAD = 2;

/**
 * Returns players whose contracts expire within MAX_SEASONS_AHEAD seasons AND
 * whose overall > MIN_OVERALL, ordered by urgency desc then overall desc.
 */
export function buildContractAlerts(
  squad: SquadPlayer[],
  currentSeason: number,
): ContractAlert[] {
  const alerts: ContractAlert[] = [];

  for (const player of squad) {
    const contractEnd = player.contractEnd;
    if (contractEnd == null) continue;
    if (player.overall <= MIN_OVERALL) continue;

    const diff = contractEnd - currentSeason;
    if (diff > MAX_SEASONS_AHEAD) continue;

    let urgency: ContractAlert['urgency'];
    if (diff <= 0) {
      urgency = 'critical';
    } else if (diff === 1) {
      urgency = 'warning';
    } else {
      urgency = 'watch';
    }

    alerts.push({ player, contractEnd, urgency });
  }

  return alerts.sort((a, b) => {
    const uo = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    if (uo !== 0) return uo;
    return b.player.overall - a.player.overall;
  });
}
