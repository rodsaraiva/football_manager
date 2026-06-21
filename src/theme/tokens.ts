// Pure design tokens — NO react-native import, so engine/util/tests can consume
// them without pulling the RN runtime. `commonStyles` (which needs StyleSheet)
// lives in ./index.ts, which re-exports everything here.

// Neutral ramp (dark theme): index baixo = mais claro, index alto = mais escuro.
// 700/800/900 são as 3 âncoras atuais (#252540/#1a1a2e/#0f0f1a) — preservadas como
// aliases em `colors`. 50→600 estendem para cima (surfaces/borders/divisores mais claros).
export const neutral = {
  50: '#f4f4f8',
  100: '#d9d9e4',
  200: '#b5b5c8',
  300: '#8e8ea6',
  400: '#5e5e78',
  500: '#41415c',
  600: '#33334e',
  700: '#252540', // = surfaceLight (alias)
  800: '#1a1a2e', // = surface (alias)
  900: '#0f0f1a', // = background (alias)
} as const;

export const colors = {
  background: neutral[900],
  surface: neutral[800],
  surfaceLight: neutral[700],
  primary: '#4361ee',
  primaryLight: '#6b8cff',
  accent: '#f72585',
  success: '#06d6a0',
  warning: '#ffd166',
  danger: '#ef476f',
  text: '#ffffff',
  textSecondary: '#a0a0b8',
  textMuted: '#6c6c80',
  border: '#2a2a45',
  gold: '#ffd700',
  silver: '#c0c0c0',
  bronze: '#cd7f32',

  // Report category palette
  reportTechnical: '#4361ee',   // primary blue — assistant técnico
  reportAnalytics: '#7b2d8b',   // purple — data analyst
  reportYouth: '#06d6a0',       // green — youth/academy
  reportFinancial: '#ffd700',   // gold — financial
  reportScout: '#00b4d8',       // teal — scouting
  reportRadar: '#48cae4',       // cyan — radar chart
  reportOpponent: '#f77f00',    // orange — opponent scouting
  reportROI: '#c9b819',         // mustard — transfer ROI
  reportProjection: '#90e0ef',  // light blue — projection
  reportHistory: '#9e9e9e',     // grey-beige — history

  // Position badge colors (semantic; were hardcoded per-helper)
  positionGK: '#f4a261',   // off-palette promoted to named token
  positionDef: '#4361ee',  // = primary
  positionMid: '#06d6a0',  // = success
  positionAtk: '#f72585',  // = accent
  // Overall/stat rating ramp (semantic; were #00e676 / #ff9800 literals)
  ratingElite: '#00e676',  // >=85 — off-palette promoted
  ratingGood: '#06d6a0',   // >=75 — = success
  ratingAverage: '#ffd166',// >=60 — = warning
  ratingPoor: '#ff9800',   // >=40 — off-palette promoted
  ratingBad: '#ef476f',    // <40  — = danger
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const fontSize = { micro: 8, xs: 10, sm: 12, md: 14, lg: 16, xl: 20, xxl: 28, title: 34, display: 56 };
export const radius = { sm: 4, md: 8, lg: 12, pill: 20, round: 999 };
