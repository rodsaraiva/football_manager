import { resolveButtonStyle } from '@/components/kit/buttonStyle';
import { colors } from '@/theme';

const ACCENT = '#22aa55';

describe('resolveButtonStyle', () => {
  it('primary usa accent como fundo e onAccent legível', () => {
    const r = resolveButtonStyle('primary', 'default', ACCENT);
    expect(r.backgroundColor).toBe(ACCENT);
    expect(r.borderWidth).toBe(0);
    expect(r.opacity).toBe(1);
    expect(r.showSpinner).toBe(false);
    expect(['#ffffff', '#000000']).toContain(r.textColor);
  });

  it('secondary é outline (borda accent, fundo transparente)', () => {
    const r = resolveButtonStyle('secondary', 'default', ACCENT);
    expect(r.backgroundColor).toBe('transparent');
    expect(r.borderColor).toBe(ACCENT);
    expect(r.borderWidth).toBe(1);
    expect(r.textColor).toBe(ACCENT);
  });

  it('ghost não tem fundo nem borda', () => {
    const r = resolveButtonStyle('ghost', 'default', ACCENT);
    expect(r.backgroundColor).toBe('transparent');
    expect(r.borderWidth).toBe(0);
    expect(r.textColor).toBe(ACCENT);
  });

  it('danger usa colors.danger independente do accent', () => {
    const r = resolveButtonStyle('danger', 'default', ACCENT);
    expect(r.backgroundColor).toBe(colors.danger);
  });

  it('disabled reduz opacidade e não mostra spinner', () => {
    const r = resolveButtonStyle('primary', 'disabled', ACCENT);
    expect(r.opacity).toBeLessThan(1);
    expect(r.showSpinner).toBe(false);
  });

  it('loading mostra spinner e mantém aparência clicável', () => {
    const r = resolveButtonStyle('primary', 'loading', ACCENT);
    expect(r.showSpinner).toBe(true);
  });

  it('pressed escurece levemente vs default (opacity < 1)', () => {
    const r = resolveButtonStyle('primary', 'pressed', ACCENT);
    expect(r.opacity).toBeLessThan(1);
  });
});
