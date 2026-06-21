import React from 'react';
import { TeamTalkScreen } from '@/screens/squad/TeamTalkScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('TeamTalkScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais', async () => {
    const r = await renderWithRealDb(<TeamTalkScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('expõe Chips de tom do kit com testID estável', async () => {
    const r = await renderWithRealDb(<TeamTalkScreen />);
    expect(r.container.querySelector('[data-testid="teamtalk-tone-praise"]')).toBeTruthy();
    expect(r.container.querySelector('[data-testid="teamtalk-tone-criticize"]')).toBeTruthy();
    r.unmount();
  });

  it('contém o título i18n da tela', async () => {
    const r = await renderWithRealDb(<TeamTalkScreen />);
    expect(collectText(r).includes(translate('pt', 'interaction.team_talk_title'))).toBe(true);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<TeamTalkScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
