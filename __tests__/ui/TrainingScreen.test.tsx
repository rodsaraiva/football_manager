import React from 'react';
import { TrainingScreen } from '@/screens/tactics/TrainingScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('TrainingScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais', async () => {
    const r = await renderWithRealDb(<TrainingScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('expõe os cards de foco com testID estável', async () => {
    const r = await renderWithRealDb(<TrainingScreen />);
    expect(r.container.querySelector('[data-testid="training-focus-technical"]')).toBeTruthy();
    expect(r.container.querySelector('[data-testid="training-focus-balanced"]')).toBeTruthy();
    r.unmount();
  });

  it('contém o título i18n', async () => {
    const r = await renderWithRealDb(<TrainingScreen />);
    expect(collectText(r).includes(translate('pt', 'training.title'))).toBe(true);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<TrainingScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
