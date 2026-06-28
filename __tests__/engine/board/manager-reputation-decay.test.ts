import { applyUnemploymentDecay } from '@/engine/board/manager-reputation-engine';
import { MANAGER_REP_UNEMPLOYED_DECAY, MANAGER_REP_FLOOR } from '@/engine/balance';

describe('applyUnemploymentDecay', () => {
  it('aplica o decaimento por temporada parada', () => {
    const r = applyUnemploymentDecay(50);
    expect(r.next).toBe(50 + MANAGER_REP_UNEMPLOYED_DECAY);
    expect(r.delta).toBe(MANAGER_REP_UNEMPLOYED_DECAY);
  });

  it('clampa no piso MANAGER_REP_FLOOR (nunca abaixo)', () => {
    const r = applyUnemploymentDecay(MANAGER_REP_FLOOR);
    expect(r.next).toBe(MANAGER_REP_FLOOR);
    expect(r.delta).toBe(0);
  });
});
