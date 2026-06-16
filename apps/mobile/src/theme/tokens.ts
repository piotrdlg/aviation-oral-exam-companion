/**
 * FLIGHT DECK design tokens — a faithful native mirror of the web app's
 * `src/app/globals.css @theme`. This is the single source of truth for the
 * native cockpit theme; values are kept identical to web (a tokens↔globals.css
 * parity check moves into packages/shared during the monorepo step).
 */

export const colors = {
  // Background scale (dark instrument glass)
  bg: '#080c12',
  panel: '#0d1117',
  bezel: '#161b22',
  elevated: '#1a2028',
  elevated2: '#1e2530',
  border: '#283142',
  borderHi: '#3a4456',

  // Amber — command / CTA / headline only
  amber: '#f5a623',
  amberBright: '#ffb94a',
  amberDim: '#b08a22',
  amberLo: '#3d2e0a',

  // Avionics green
  green: '#19e66b',
  greenReadable: '#4be88e',
  greenDim: '#0a5c1a',
  greenLo: '#0a2e10',

  // Cyan — data accent; -readable for cyan TEXT
  cyan: '#00d4ff',
  cyanReadable: '#4fd8ff',
  cyanDim: '#0a4a5c',
  cyanLo: '#082a35',

  // Red
  red: '#ff5a4d',
  redDim: '#5c1a16',

  // Text scale (dim is the floor — never go below)
  text: '#d7dee6',
  muted: '#aab4c0',
  dim: '#9aa4b2',
} as const;

/** 4px spacing scale. */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/**
 * Font families. Until IBM Plex Sans / JetBrains Mono are loaded via expo-font
 * (next step), fall back to the platform system + monospace faces so layout and
 * the caps-mono cockpit labels still read correctly.
 */
export const font = {
  sans: 'System',
  sansMedium: 'System',
  sansSemibold: 'System',
  sansBold: 'System',
  mono: 'Menlo', // iOS system monospace; swapped for JetBrains Mono next
} as const;

/** Type scale (px). 12px is the hard floor — never 10px (FLIGHT DECK rule). */
export const fontSize = {
  micro: 12,
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  h3: 18,
  h2: 28,
  h1: 36,
  hero: 44,
} as const;

/** Minimum touch target — 44pt iOS / 48dp Android (use the larger). */
export const HIT_TARGET = 48;
