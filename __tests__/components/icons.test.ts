import { ICONS, IconName } from '@/components/kit/icons';

const NAMES: IconName[] = [
  'play', 'squad', 'news', 'tactics', 'money', 'chart',
  'goal', 'assist', 'yellow', 'red', 'sub', 'injury',
  'whistle', 'shield', 'target', 'glove',
  'arrowRight', 'check', 'close',
];

describe('ICONS', () => {
  it('cobre todos os nomes do set inicial', () => {
    NAMES.forEach((n) => expect(ICONS[n]).toBeDefined());
  });
  it('cada ícone tem viewBox e ao menos 1 path com d não vazio', () => {
    Object.values(ICONS).forEach((def) => {
      expect(def.viewBox).toMatch(/^\d+ \d+ \d+ \d+$/);
      expect(def.paths.length).toBeGreaterThanOrEqual(1);
      def.paths.forEach((p) => expect(p.d.length).toBeGreaterThan(0));
    });
  });
});
