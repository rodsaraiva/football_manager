import { IconDef } from './icons';

export type EmptyArt = 'inbox' | 'search' | 'squad' | 'generic';

const VB = '0 0 64 64';

export const EMPTY_ART: Record<EmptyArt, IconDef> = {
  inbox:   { viewBox: VB, paths: [{ d: 'M8 20h48v28a4 4 0 01-4 4H12a4 4 0 01-4-4zM8 20l8-12h32l8 12M24 20a8 8 0 0016 0' }] },
  search:  { viewBox: VB, paths: [{ d: 'M28 12a16 16 0 100 32 16 16 0 000-32zm14 30l12 12' }] },
  squad:   { viewBox: VB, paths: [{ d: 'M32 14a8 8 0 100 16 8 8 0 000-16zM16 52v-2c0-7 7-12 16-12s16 5 16 12v2z' }] },
  generic: { viewBox: VB, paths: [{ d: 'M12 12h40v40H12zM12 24h40M24 12v40' }] },
};
