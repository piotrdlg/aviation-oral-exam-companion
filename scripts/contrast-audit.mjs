/**
 * WCAG 2.1 Contrast Ratio Audit for HeyDPE — All Themes
 * Tests all text/background color combinations used in the dashboard
 * across Cockpit (default), Glass Cockpit, Sectional, and Briefing themes.
 */

// sRGB to linear channel
function sRGBtoLinear(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Relative luminance (WCAG 2.1)
function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * sRGBtoLinear(r) + 0.7152 * sRGBtoLinear(g) + 0.0722 * sRGBtoLinear(b);
}

// Contrast ratio (WCAG 2.1)
function contrastRatio(hex1, hex2) {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// WCAG thresholds
function wcagGrade(ratio, isLargeText) {
  if (isLargeText) {
    if (ratio >= 4.5) return 'AAA';
    if (ratio >= 3.0) return 'AA';
    return 'FAIL';
  } else {
    if (ratio >= 7.0) return 'AAA';
    if (ratio >= 4.5) return 'AA';
    return 'FAIL';
  }
}

// ============================================
// THEME COLOR DEFINITIONS
// ============================================

const themes = {
  cockpit: {
    'c-bg':        '#080c12',
    'c-panel':     '#0d1117',
    'c-bezel':     '#161b22',
    'c-elevated':  '#1a2028',
    'c-border':    '#1c2333',
    'c-text':      '#c9d1d9',
    'c-muted':     '#8b949e',
    'c-dim':       '#7d8898',
    'c-amber':     '#f5a623',
    'c-cyan':      '#00d4ff',
    'c-green':     '#00ff41',
    'c-red':       '#ff3b30',
    'c-amber-dim': '#b08a22',
  },
  glass: {
    'c-bg':        '#080c12',
    'c-panel':     '#0d1117',
    'c-bezel':     '#161b22',
    'c-elevated':  '#1a2028',
    'c-border':    '#1c2333',
    'c-text':      '#c9d1d9',
    'c-muted':     '#8b949e',
    'c-dim':       '#7d8898',
    'c-amber':     '#3B82F6',
    'c-cyan':      '#67E8F9',
    'c-green':     '#34D399',
    'c-red':       '#F87171',
    'c-amber-dim': '#1E3A6E',
  },
  sectional: {
    'c-bg':        '#F6F1E8',
    'c-panel':     '#F0EADF',
    'c-bezel':     '#EBE4D8',
    'c-elevated':  '#E5DED2',
    'c-border':    '#D5CCB8',
    'c-text':      '#2C2721',
    'c-muted':     '#5B5245',
    'c-dim':       '#6B6154',
    'c-amber':     '#9A4409',
    'c-cyan':      '#1B5E8A',
    'c-green':     '#1B6B35',
    'c-red':       '#B32028',
    'c-amber-dim': '#D4A070',
  },
  briefing: {
    'c-bg':        '#F4F5F7',
    'c-panel':     '#ECEDF0',
    'c-bezel':     '#E4E5E9',
    'c-elevated':  '#DDDEE3',
    'c-border':    '#CDD0D6',
    'c-text':      '#1A1D23',
    'c-muted':     '#555B65',
    'c-dim':       '#5C6370',
    'c-amber':     '#1A56A0',
    'c-cyan':      '#1E6585',
    'c-green':     '#14673E',
    'c-red':       '#B32530',
    'c-amber-dim': '#7AADDA',
  },
};

// All real foreground/background combinations in dashboard
const combinations = [
  // Nav and labels (text-c-muted on various backgrounds)
  { fg: 'c-muted', bg: 'c-bg',      ctx: 'Nav inactive items on page bg',      large: false },
  { fg: 'c-muted', bg: 'c-panel',    ctx: 'Labels on panel bg',                large: false },
  { fg: 'c-muted', bg: 'c-bezel',    ctx: 'Labels on bezel/card bg',           large: false },
  { fg: 'c-muted', bg: 'c-elevated', ctx: 'Labels on elevated surface',        large: false },

  // Dim text (text-c-dim on various backgrounds)
  { fg: 'c-dim', bg: 'c-bg',         ctx: 'Dim text on page bg',               large: false },
  { fg: 'c-dim', bg: 'c-panel',      ctx: 'Dim text on panel bg',              large: false },
  { fg: 'c-dim', bg: 'c-bezel',      ctx: 'Dim text on bezel/card bg',         large: false },
  { fg: 'c-dim', bg: 'c-elevated',   ctx: 'Dim text on elevated surface',      large: false },

  // Primary text
  { fg: 'c-text', bg: 'c-bg',        ctx: 'Primary text on page bg',           large: false },
  { fg: 'c-text', bg: 'c-panel',     ctx: 'Primary text on panel bg',          large: false },
  { fg: 'c-text', bg: 'c-bezel',     ctx: 'Primary text on bezel/card bg',     large: false },

  // Accent text on backgrounds
  { fg: 'c-amber', bg: 'c-bg',       ctx: 'Amber accent on page bg',           large: false },
  { fg: 'c-amber', bg: 'c-bezel',    ctx: 'Amber accent on bezel bg',          large: false },
  { fg: 'c-cyan',  bg: 'c-bg',       ctx: 'Cyan accent on page bg',            large: false },
  { fg: 'c-cyan',  bg: 'c-bezel',    ctx: 'Cyan accent on bezel bg',           large: false },
  { fg: 'c-green', bg: 'c-bg',       ctx: 'Green accent on page bg',           large: false },
  { fg: 'c-red',   bg: 'c-bg',       ctx: 'Red accent on page bg',             large: false },

  // Large text (headings — 18px+ or 14px+ bold)
  { fg: 'c-muted', bg: 'c-bg',       ctx: 'Muted heading on page bg',          large: true },
  { fg: 'c-amber', bg: 'c-bg',       ctx: 'Amber heading on page bg',          large: true },
];

// ============================================
// Run audit for all themes
// ============================================

let totalFailures = 0;

for (const [themeName, colors] of Object.entries(themes)) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  THEME: ${themeName.toUpperCase()}`);
  console.log(`${'='.repeat(60)}\n`);
  console.log('Target: AA for normal text (4.5:1), AA for large text (3:1)\n');

  const failures = [];
  const warnings = [];

  for (const combo of combinations) {
    const ratio = contrastRatio(colors[combo.fg], colors[combo.bg]);
    const grade = wcagGrade(ratio, combo.large);
    const label = combo.large ? '(large)' : '(normal)';
    const status = grade === 'FAIL' ? 'FAIL' : grade === 'AA' ? ' AA ' : ' AAA';
    const line = `[${status}] ${ratio.toFixed(2)}:1  ${combo.fg} (${colors[combo.fg]}) on ${combo.bg} (${colors[combo.bg]}) ${label} — ${combo.ctx}`;
    console.log(line);

    if (grade === 'FAIL') failures.push({ ...combo, ratio });
    else if (grade === 'AA' && !combo.large) warnings.push({ ...combo, ratio });
  }

  console.log(`\n--- ${themeName} Summary ---`);
  console.log(`Total combinations: ${combinations.length}`);
  console.log(`FAIL (below AA): ${failures.length}`);
  console.log(`AA (meets minimum): ${warnings.length}`);
  console.log(`AAA (exceeds): ${combinations.length - failures.length - warnings.length}`);

  if (failures.length > 0) {
    console.log(`\n*** FAILURES in ${themeName} ***`);
    for (const f of failures) {
      const needed = f.large ? 3.0 : 4.5;
      console.log(`  ${f.fg} on ${f.bg}: ${f.ratio.toFixed(2)}:1 (need ${needed}:1)`);
    }
  }

  totalFailures += failures.length;
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  OVERALL RESULT: ${totalFailures === 0 ? 'ALL THEMES PASS' : `${totalFailures} FAILURE(S) FOUND`}`);
console.log(`${'='.repeat(60)}\n`);

process.exit(totalFailures > 0 ? 1 : 0);
