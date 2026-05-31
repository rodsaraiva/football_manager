import { translate } from '@/i18n/translate';

describe('translate', () => {
  it('resolves a key in pt and en', () => {
    expect(translate('pt', 'mainmenu.new_game')).toBe('Novo Jogo');
    expect(translate('en', 'mainmenu.new_game')).toBe('New Game');
  });

  it('interpolates a single variable', () => {
    expect(translate('pt', 'mainmenu.save_default', { id: 3 })).toBe('Jogo #3');
  });

  it('interpolates multiple variables', () => {
    expect(translate('en', 'mainmenu.save_meta', { season: 1, week: 2 }))
      .toBe('Season 1 — Week 2');
  });

  it('falls back to the key itself when missing (defensive)', () => {
    // @ts-expect-error intentionally passing an unknown key
    expect(translate('pt', 'does.not.exist')).toBe('does.not.exist');
  });
});
