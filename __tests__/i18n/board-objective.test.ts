import { objectiveDescriptor } from '@/i18n/board-objective';

describe('objectiveDescriptor', () => {
  it('maps no_relegation', () => {
    expect(objectiveDescriptor('no_relegation', null)).toEqual({ key: 'objective.no_relegation' });
  });

  it('maps top_half with target var', () => {
    expect(objectiveDescriptor('top_half', 10)).toEqual({ key: 'objective.top_half', vars: { target: 10 } });
  });

  it('league_position target=1 → win_league', () => {
    expect(objectiveDescriptor('league_position', 1)).toEqual({ key: 'objective.win_league' });
  });

  it('league_position target>1 → league_position with var', () => {
    expect(objectiveDescriptor('league_position', 3)).toEqual({ key: 'objective.league_position', vars: { target: 3 } });
  });

  it('maps cup_win / budget_balance / promotion', () => {
    expect(objectiveDescriptor('cup_win', null)).toEqual({ key: 'objective.cup_win' });
    expect(objectiveDescriptor('budget_balance', null)).toEqual({ key: 'objective.budget_balance' });
    expect(objectiveDescriptor('promotion', null)).toEqual({ key: 'objective.promotion' });
  });

  it('league_position with null target falls back to 0 var', () => {
    expect(objectiveDescriptor('league_position', null)).toEqual({ key: 'objective.league_position', vars: { target: 0 } });
  });
});
