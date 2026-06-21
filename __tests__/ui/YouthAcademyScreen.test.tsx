import React from 'react';
import { YouthAcademyScreen } from '@/screens/squad/YouthAcademyScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('YouthAcademyScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais', async () => {
    const r = await renderWithRealDb(<YouthAcademyScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('contém título e estado vazio i18n', async () => {
    const r = await renderWithRealDb(<YouthAcademyScreen />);
    const text = collectText(r);
    expect(text.includes(translate('pt', 'youth.title'))).toBe(true);
    // Tela reescrita (C2): sem talentos de base ⇒ estado vazio das reservas.
    expect(text.includes(translate('pt', 'youth.empty_reserves'))).toBe(true);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<YouthAcademyScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
