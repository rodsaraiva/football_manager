import { create } from 'zustand';
import { DbHandle } from '@/database/queries/players';
import { getSetting, setSetting } from '@/database/queries/settings';
import { Difficulty } from '@/types/save';

export interface SettingsState {
  reduceMotion: boolean;
  haptics: boolean;
  fontScale: number;
  difficultyDefault: Difficulty;
}

const VALID_FONT_SCALES = [0.9, 1, 1.15];
const VALID_DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

const DEFAULTS: SettingsState = {
  reduceMotion: false,
  haptics: true,
  fontScale: 1,
  difficultyDefault: 'normal',
};

export const useSettingsStore = create<SettingsState>(() => ({ ...DEFAULTS }));

/** Reads persisted preferences into the store. Missing/invalid → keeps defaults. */
export async function hydrateSettings(db: DbHandle): Promise<void> {
  const reduce = await getSetting(db, 'reduce_motion');
  const haptics = await getSetting(db, 'haptics');
  const scaleRaw = await getSetting(db, 'font_scale');
  const diffRaw = await getSetting(db, 'difficulty_default');

  const scale = scaleRaw === null ? DEFAULTS.fontScale : Number(scaleRaw);
  const diff = diffRaw as Difficulty | null;

  useSettingsStore.setState({
    reduceMotion: reduce === null ? DEFAULTS.reduceMotion : reduce === '1',
    haptics: haptics === null ? DEFAULTS.haptics : haptics === '1',
    fontScale: VALID_FONT_SCALES.includes(scale) ? scale : DEFAULTS.fontScale,
    difficultyDefault:
      diff && VALID_DIFFICULTIES.includes(diff) ? diff : DEFAULTS.difficultyDefault,
  });
}

export async function setReduceMotion(db: DbHandle, v: boolean): Promise<void> {
  useSettingsStore.setState({ reduceMotion: v });
  await setSetting(db, 'reduce_motion', v ? '1' : '0');
}

export async function setHaptics(db: DbHandle, v: boolean): Promise<void> {
  useSettingsStore.setState({ haptics: v });
  await setSetting(db, 'haptics', v ? '1' : '0');
}

export async function setFontScale(db: DbHandle, v: number): Promise<void> {
  useSettingsStore.setState({ fontScale: v });
  await setSetting(db, 'font_scale', String(v));
}

export async function setDifficultyDefault(db: DbHandle, v: Difficulty): Promise<void> {
  useSettingsStore.setState({ difficultyDefault: v });
  await setSetting(db, 'difficulty_default', v);
}
