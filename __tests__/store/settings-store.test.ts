import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { getSetting } from '@/database/queries/settings';
import {
  useSettingsStore,
  hydrateSettings,
  setReduceMotion,
  setHaptics,
  setFontScale,
  setDifficultyDefault,
  setShow2D,
} from '@/store/settings-store';

const DEFAULTS = { reduceMotion: false, haptics: true, fontScale: 1, difficultyDefault: 'normal', show2D: false } as const;

describe('settings store', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(() => {
    rawDb = createTestDb();
    db = createTestDbHandle(rawDb);
    useSettingsStore.setState({ ...DEFAULTS });
  });
  afterEach(() => rawDb.close());

  it('has documented defaults', () => {
    expect(useSettingsStore.getState()).toMatchObject(DEFAULTS);
  });

  it('hydrateSettings on empty db keeps defaults', async () => {
    await hydrateSettings(db);
    expect(useSettingsStore.getState()).toMatchObject(DEFAULTS);
  });

  it('setters persist to app_settings and update the store', async () => {
    await setReduceMotion(db, true);
    await setHaptics(db, false);
    await setFontScale(db, 1.15);
    await setDifficultyDefault(db, 'hard');

    expect(useSettingsStore.getState()).toMatchObject({
      reduceMotion: true, haptics: false, fontScale: 1.15, difficultyDefault: 'hard',
    });
    expect(await getSetting(db, 'reduce_motion')).toBe('1');
    expect(await getSetting(db, 'haptics')).toBe('0');
    expect(await getSetting(db, 'font_scale')).toBe('1.15');
    expect(await getSetting(db, 'difficulty_default')).toBe('hard');
  });

  it('hydrateSettings reads persisted values back into the store', async () => {
    await setReduceMotion(db, true);
    await setHaptics(db, false);
    await setFontScale(db, 0.9);
    await setDifficultyDefault(db, 'easy');
    useSettingsStore.setState({ ...DEFAULTS }); // wipe in-memory

    await hydrateSettings(db);
    expect(useSettingsStore.getState()).toMatchObject({
      reduceMotion: true, haptics: false, fontScale: 0.9, difficultyDefault: 'easy',
    });
  });

  it('show2D persiste em show_2d e sobrevive ao hydrate', async () => {
    await setShow2D(db, true);
    expect(useSettingsStore.getState().show2D).toBe(true);
    expect(await getSetting(db, 'show_2d')).toBe('1');

    useSettingsStore.setState({ ...DEFAULTS }); // wipe in-memory
    await hydrateSettings(db);
    expect(useSettingsStore.getState().show2D).toBe(true);
  });

  it('hydrateSettings ignores invalid font_scale / difficulty', async () => {
    await db.prepare("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('font_scale','99')").run();
    await db.prepare("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('difficulty_default','lol')").run();
    await hydrateSettings(db);
    expect(useSettingsStore.getState().fontScale).toBe(1);
    expect(useSettingsStore.getState().difficultyDefault).toBe('normal');
  });
});
