export type IconName =
  | 'play' | 'squad' | 'news' | 'tactics' | 'money' | 'chart'
  | 'goal' | 'assist' | 'yellow' | 'red' | 'sub' | 'injury'
  | 'whistle' | 'shield' | 'target' | 'glove'
  | 'arrowRight' | 'check' | 'close';

export interface IconDef { viewBox: string; paths: { d: string; fillRule?: 'evenodd' }[]; }

const VB = '0 0 24 24';

export const ICONS: Record<IconName, IconDef> = {
  play:     { viewBox: VB, paths: [{ d: 'M8 5v14l11-7z' }] },
  squad:    { viewBox: VB, paths: [{ d: 'M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z' }] },
  news:     { viewBox: VB, paths: [{ d: 'M4 4h16v16H4zM6 8h12M6 12h12M6 16h8', fillRule: 'evenodd' }] },
  tactics:  { viewBox: VB, paths: [{ d: 'M4 4h16v16H4zM12 4v16M4 12h16' }] },
  money:    { viewBox: VB, paths: [{ d: 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-1H9v-2h4v-1H9V9h2V8h2v1h2v2h-4v1h4v3h-2z' }] },
  chart:    { viewBox: VB, paths: [{ d: 'M4 20V4M4 20h16M8 18v-6M12 18V8M16 18v-9M20 18v-4' }] },
  goal:     { viewBox: VB, paths: [{ d: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 3l2.5 1.8-1 3H10.5l-1-3z' }] },
  assist:   { viewBox: VB, paths: [{ d: 'M5 12h11l-4-4m4 4l-4 4M3 5v14' }] },
  yellow:   { viewBox: VB, paths: [{ d: 'M7 3h7l3 3v15H7z' }] },
  red:      { viewBox: VB, paths: [{ d: 'M7 3h7l3 3v15H7z' }] },
  sub:      { viewBox: VB, paths: [{ d: 'M7 7h9l-3-3m3 3l-3 3M17 17H8l3 3m-3-3l3-3' }] },
  injury:   { viewBox: VB, paths: [{ d: 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z' }] },
  whistle:  { viewBox: VB, paths: [{ d: 'M3 10a5 5 0 005 5h6l4 3v-8H8a5 5 0 00-5 0z' }] },
  shield:   { viewBox: VB, paths: [{ d: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z' }] },
  target:   { viewBox: VB, paths: [{ d: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a6 6 0 100 12 6 6 0 000-12zm0 4a2 2 0 100 4 2 2 0 000-4z', fillRule: 'evenodd' }] },
  glove:    { viewBox: VB, paths: [{ d: 'M6 10V6a2 2 0 014 0v4V4a2 2 0 014 0v6a4 4 0 01-4 4H8a4 4 0 01-4-4z' }] },
  arrowRight:{ viewBox: VB, paths: [{ d: 'M5 12h14m-6-6l6 6-6 6' }] },
  check:    { viewBox: VB, paths: [{ d: 'M5 13l4 4L19 7' }] },
  close:    { viewBox: VB, paths: [{ d: 'M6 6l12 12M18 6L6 18' }] },
};
