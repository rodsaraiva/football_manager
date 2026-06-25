import { useGameStore } from '@/store/game-store';

it('setLive guarda windowKind e advice; null limpa', () => {
  const fakeState: any = { home: { squad: [] }, currentBlock: 15 };
  useGameStore.getState().setLive({
    halftime: fakeState, isHome: true, opponentName: 'Rival',
    bench: [], tactic: null as any, fixtureId: 1,
    windowKind: 'second_half', advice: [{ kind: 'hold', text: { key: 'advice.hold.tactician' }, priority: 30 }],
  });
  expect(useGameStore.getState().liveWindowKind).toBe('second_half');
  expect(useGameStore.getState().liveAdvice).toHaveLength(1);
  useGameStore.getState().setLive(null);
  expect(useGameStore.getState().liveWindowKind).toBeNull();
  expect(useGameStore.getState().liveAdvice).toHaveLength(0);
});
