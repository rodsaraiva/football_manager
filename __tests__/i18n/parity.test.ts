import { pt } from '@/i18n/pt';
import { en } from '@/i18n/en';

describe('dictionary parity', () => {
  it('pt and en have exactly the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });
});
