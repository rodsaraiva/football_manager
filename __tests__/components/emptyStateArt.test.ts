import { EMPTY_ART, EmptyArt } from '@/components/kit/emptyStateArt';

const ARTS: EmptyArt[] = ['inbox', 'search', 'squad', 'generic'];

it('cada ilustração tem viewBox e ao menos 1 path', () => {
  ARTS.forEach((a) => {
    expect(EMPTY_ART[a]).toBeDefined();
    expect(EMPTY_ART[a].paths.length).toBeGreaterThanOrEqual(1);
  });
});
