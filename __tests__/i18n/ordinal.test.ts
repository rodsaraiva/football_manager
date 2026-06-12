import { ordinal } from '@/i18n/ordinal';

describe('ordinal', () => {
  it('en: 1st/2nd/3rd/4th', () => {
    expect(ordinal('en', 1)).toBe('1st');
    expect(ordinal('en', 2)).toBe('2nd');
    expect(ordinal('en', 3)).toBe('3rd');
    expect(ordinal('en', 4)).toBe('4th');
  });

  it('en: 11/12/13 are th, not st/nd/rd', () => {
    expect(ordinal('en', 11)).toBe('11th');
    expect(ordinal('en', 12)).toBe('12th');
    expect(ordinal('en', 13)).toBe('13th');
  });

  it('en: 21/22/23 are st/nd/rd', () => {
    expect(ordinal('en', 21)).toBe('21st');
    expect(ordinal('en', 22)).toBe('22nd');
    expect(ordinal('en', 23)).toBe('23rd');
  });

  it('pt: always Nº', () => {
    expect(ordinal('pt', 1)).toBe('1º');
    expect(ordinal('pt', 2)).toBe('2º');
    expect(ordinal('pt', 11)).toBe('11º');
  });
});
