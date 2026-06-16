# HeyDPE Mobile — Native-Adapted FLIGHT DECK Design System

> **Status:** Plan / source-of-truth spec for `apps/mobile` (iOS first, Android follows).
> **Owner:** Piotr (pd@imagineflying.com) — Imagine Flying LLC.
> **Last updated:** 2026-06-15.
> **Authoritative web reference:** the shipped tokens in `src/app/globals.css:3-44` (Tailwind v4 `@theme`), the discipline rules in `docs/design/2026-06-14-flight-deck-application-guide.md`, and the brand mark in `src/components/Brand.tsx`.
> **Locked decisions this doc builds on (do NOT re-litigate):** React Native + Expo (New Architecture, dev-client builds); monorepo with `apps/mobile` + `packages/shared`; "Native-adapted FLIGHT DECK" design language (keep the cockpit brand, honor iOS HIG / Android Material 3 for system patterns); PARITY v1 across the 7 core screens; iOS first; RevenueCat / IAP primary on iOS.

---

## 0. How to use this document

This is the **single source of design truth** for the mobile app. Every screen author MUST:

1. Read §1 (the typography rule) before writing any text.
2. Consume tokens **only** from `packages/shared/theme` (§2) — never hard-code a hex literal in a screen.
3. Build UI from the component library in §5 — never invent a button/card/badge variant not listed here without an OWNER DECISION.
4. Self-verify against the **Compliance Checklist** in §11 before opening a PR.

The web app's tokens are the **canonical literals**. The shipped `globals.css` wins over any prior spec (`redesign-spec.md` was the proposal; `globals.css` is the truth). Mobile mirrors the **shipped** literals exactly — same hex, same semantic role.

> **Reconciliation rule (verbatim from the token brief):** *Where the proposal and shipped CSS differ, trust `globals.css`.* Example: shipped `--color-c-border` is `#283142` (not the proposal's `#1c2333`), shipped `--color-c-dim` is `#9aa4b2` (not `#565e68`), shipped scanline is `0.022` (not `0.03–0.035`). The `--shadow-instrument` var was never created; the recipe is inlined per surface class. Mobile mirrors shipped.

---

## 1. Brand & identity carry-over

### 1.1 What carries over (non-negotiable brand DNA)

The cockpit brand identity is **kept**, not diluted, on native:

- **Attitude-indicator brand mark** (artificial-horizon monogram) — the single most iconic checkride instrument; defined in `src/components/Brand.tsx:12-78`.
- **Two-tone wordmark** — "Hey" in reading ink (`c-text`) + "DPE" in command amber (`c-amber`), `font-mono font-bold tracking-tight` (`Brand.tsx:108-111`).
- **Cockpit micro-labels** — `// Procedure`, `// Systems`, `// Comparison` — small, letter-tracked, colored mono, sentence-case after the `//` (acronyms like `// FAQ` stay capped) (`flight-deck-application-guide.md:28-31`).
- **Status annunciators / badges** — `Satisfactory`, `Active`, `Best value` — caps-mono pills that read like cockpit annunciator lights.
- **Mono numeric readouts** — gauge values, prices, counts in `tabular-nums` so digits align like an instrument.
- **Bezel / station / iframe surfaces** — the "instrument cluster" depth metaphor (§4).
- **Glow** — reserved for instrument moments only (§7).

### 1.2 THE ONE RULE (reproduced verbatim from `flight-deck-application-guide.md:9-22`)

> **If a string is longer than ~5 words OR is prose a user reads to comprehend, it is IBM Plex sentence-case — never caps-mono.**
>
> Caps-mono (`font-mono … uppercase`) is reserved for, and only for:
> - the landing **hero H1** (the single brand instrument moment),
> - **cockpit micro-labels** (`// Procedure`, `// Systems`) — small, tracked, colored,
> - **status annunciators / badges** (`Satisfactory`, `Best value`, `Active`),
> - **ACS / element codes** (`PA.I.B`, `FAA-S-ACS-6C`),
> - **numeric instrument readouts** (gauge values, prices) — `font-mono tabular-nums`.
>
> Everything else → Plex sentence-case.

The three-role system (`redesign-spec.md:53-58`) restated for mobile authors:

| Role | Font | Case | Glow? | Used for |
|------|------|------|-------|----------|
| **Role 1 · INSTRUMENT** | JetBrains Mono | UPPERCASE, tracking-wide | allowed (instrument moments only) | hero H1, micro-labels, annunciators/badges, ACS codes |
| **Role 2 · READING** | IBM Plex Sans | Sentence case | never | examiner questions, answers, feedback, descriptions, subheads, legal |
| **Role 3 · NUMERIC** | Plex tabular-nums / JetBrains Mono for gauges | digits | allowed on live gauges | stat values, prices, counts |

**Native translation of "caps-mono":** there is no CSS `text-transform` ergonomic on RN `<Text>` by default at scale, so the shared `<Annunciator>` / `<MicroLabel>` / `<CodeChip>` primitives (§5) apply `textTransform: 'uppercase'`, `fontFamily: 'JetBrainsMono'`, and `letterSpacing` in their style — authors never re-implement the cap-mono treatment inline; they reach for the primitive.

#### Qualitative requirements
- The brand mark renders crisp, banked, and legible at the smallest size it appears (tab bar, nav, splash).
- No body prose, button label, nav label, list-row title, or settings label is ever ALL-CAPS mono.
- Caps-mono appears only on: app icon/splash hero moment, micro-labels, annunciator badges, ACS/element codes, numeric readouts.

#### Measurable success criteria
- [ ] Brand mark legible at **24×24pt** in nav and **≥16×16pt** anywhere it appears (matches web "legible down to 16px", `Brand.tsx:8`).
- [ ] **0** occurrences of `textTransform: 'uppercase'` on any Role-2 reading string in a screen file (lint rule: caps-mono only via approved primitives).
- [ ] Wordmark uses exactly two colors: "Hey" = `c-text`, "DPE" = `c-amber` (zero deviations).
- [ ] A grep of screen files for raw `letterSpacing` outside the shared primitives returns **0** matches.
- [ ] Manual audit: every caps-mono string fits one of the 5 allowed categories — pass/fail per screen.

### 1.3 Brand mark — native implementation

**Source of truth:** `src/components/Brand.tsx:12-78` (a 32×32 viewBox SVG, attitude indicator banked `rotate(-8 16 16)`, cyan sky gradient over amber earth, `c-border-hi` bezel ring, fixed amber aircraft-reference wings with `c-bg` dark backing, amber bank-pointer triangle at top).

**Mobile delivery:** port the SVG verbatim into `packages/shared/brand/BrandMark.tsx` rendered with **`react-native-svg`**. The web mark references `var(--color-c-*)` tokens for theme adaptation; on RN, the component reads the **same token names from the shared theme object** (§2) and passes resolved hex into `stop`/`stroke`/`fill` props (RN SVG cannot read CSS custom properties).

- **`<BrandMark size={n} />`** — default `size=22` (matches `Brand.tsx:13`). Sizes mirror web `Logo`: `sm`={mark:18}, `md`={mark:22}, `lg`={mark:38} (`Brand.tsx:82-86`).
- **`<Logo size="sm|md|lg" glow />`** — `BrandMark` + two-tone wordmark in `JetBrainsMono` bold, `letterSpacing` tight; `glow` applies the amber glow to the "DPE" span only (text-shadow has no RN analog → emulate with an amber `shadowColor`/`textShadow*` on the `<Text>`, see §7.1).

OWNER DECISION — **app icon & splash**: the App Store icon (1024×1024, no alpha, no rounded corners — Apple rounds) and adaptive Android icon (108×108dp foreground + background layers) must be derived from the BrandMark over a `c-bg` field. This doc specifies the *source mark*; the final exported icon assets (and whether the wordmark appears on the icon or just the instrument) are an owner sign-off item. **Default proposal:** instrument-only on the icon (no wordmark), `c-bg` background, amber/cyan instrument fills — matches the "legible at small size" constraint.

#### Measurable success criteria
- [ ] `BrandMark` renders pixel-faithful to web at 22pt (side-by-side screenshot diff, no missing horizon line / wings / bank pointer).
- [ ] Mark re-tints correctly when theme changes (cockpit → glass/sectional/briefing) with **0** hard-coded hex inside the SVG component.
- [ ] App icon passes App Store Connect upload validation (1024², sRGB, no alpha) and Play Console adaptive-icon validation — pass/fail at submission.

---

## 2. Color tokens

### 2.1 Canonical token table — default "Cockpit" theme

Reproduced exactly from `src/app/globals.css:9-43`. All hex sRGB. **These literals are the contract.**

**Background / surface scale** (`globals.css:9-15`):

| Token | Hex | Semantic role |
|---|---|---|
| `c-bg` | `#080c12` | Ground / app background (deep navy-black) |
| `c-panel` | `#0d1117` | Base surface |
| `c-bezel` | `#161b22` | Raised instrument glass (card bg) |
| `c-elevated` | `#1a2028` | Elevated surface |
| `c-elevated-2` | `#1e2530` | The ONE "lit instrument glass" / active examiner station surface (`.station`) |
| `c-border` | `#283142` | Visible 1px hairline borders |
| `c-border-hi` | `#3a4456` | High-emphasis border / bezel ring |

**Amber — command / CTA / headline ONLY** (`globals.css:18-21`):

| Token | Hex | Role |
|---|---|---|
| `c-amber` | `#f5a623` | Command / CTA / headline accent |
| `c-amber-bright` | `#ffb94a` | Hover / pressed / active annunciator |
| `c-amber-dim` | `#b08a22` | Progress-bar gradient start, dim labels |
| `c-amber-lo` | `#3d2e0a` | Low-alpha amber fill |

**Green — avionics green** (harsh neon `#00ff41` retired) (`globals.css:24-27`):

| Token | Hex | Role |
|---|---|---|
| `c-green` | `#19e66b` | Avionics green accent (non-text: fills, icons, gauge) |
| `c-green-readable` | `#4be88e` | **Green TEXT** (e.g. "Satisfactory") — clears 4.5:1 |
| `c-green-dim` | `#0a5c1a` | Gradient / dim |
| `c-green-lo` | `#0a2e10` | Low-alpha fill |

**Cyan — data accent** (`globals.css:30-33`):

| Token | Hex | Role |
|---|---|---|
| `c-cyan` | `#00d4ff` | Data accent (non-text: micro-labels swatch, waveform, gauge) |
| `c-cyan-readable` | `#4fd8ff` | **Cyan TEXT** — clears 4.5:1 |
| `c-cyan-dim` | `#0a4a5c` | Gradient / dim |
| `c-cyan-lo` | `#082a35` | Low-alpha fill |

**Red — danger** (lifted for AA on dark) (`globals.css:36-37`):

| Token | Hex | Role |
|---|---|---|
| `c-red` | `#ff5a4d` | Danger / UNSAT |
| `c-red-dim` | `#5c1a16` | Gradient / dim |

**Text** (`globals.css:41-43`):

| Token | Hex | Role |
|---|---|---|
| `c-text` | `#d7dee6` | Primary reading text |
| `c-muted` | `#aab4c0` | Secondary text (~0.72 white; the single biggest WCAG fix) |
| `c-dim` | `#9aa4b2` | Faint text — **floor, never go below** |

### 2.2 The `-readable` rule (`flight-deck-application-guide.md:38-40`)

Reading text = `c-text`; secondary = `c-muted`; faint = `c-dim`. **Cyan/green TEXT MUST use `-readable` variants** (`c-cyan-readable`, `c-green-readable`) to clear 4.5:1. Base `c-cyan` / `c-green` are for **fills, icons, gauge arcs, accents — NOT body text.**

This is enforced in the theme type (§2.3): the shared theme exposes `colors.cyanReadable` / `colors.greenReadable` as the only cyan/green *text* tokens a `<Text>` style may consume; a lint rule flags any `<Text>` whose `color` resolves to `colors.cyan` or `colors.green`.

### 2.3 RN token delivery — shared theme object in `packages/shared`

There is **no Tailwind on native**. Tokens ship as a **typed theme object** — the single source consumed by both web (which still reads `globals.css`) and, going forward, mobile. The literals live once.

```ts
// packages/shared/theme/tokens.ts  — mirrors globals.css:9-43 exactly
export const cockpit = {
  colors: {
    // background / surface scale
    bg: '#080c12', panel: '#0d1117', bezel: '#161b22',
    elevated: '#1a2028', elevated2: '#1e2530',
    border: '#283142', borderHi: '#3a4456',
    // amber
    amber: '#f5a623', amberBright: '#ffb94a', amberDim: '#b08a22', amberLo: '#3d2e0a',
    // green
    green: '#19e66b', greenReadable: '#4be88e', greenDim: '#0a5c1a', greenLo: '#0a2e10',
    // cyan
    cyan: '#00d4ff', cyanReadable: '#4fd8ff', cyanDim: '#0a4a5c', cyanLo: '#082a35',
    // red
    red: '#ff5a4d', redDim: '#5c1a16',
    // text
    text: '#d7dee6', muted: '#aab4c0', dim: '#9aa4b2',
  },
} as const;

export type Theme = typeof cockpit;
```

Consumed via a `ThemeProvider` (React context) + a `useTheme()` hook. Screens read `const t = useTheme(); ... color: t.colors.text`. **No screen file contains a hex literal.**

> **OWNER DECISION — shared package boundary:** the LOCKED decision extracts `sentence-boundary.ts`, `database.ts`, and tier mapping into `packages/shared`. This doc adds `packages/shared/theme/*` (tokens, ThemeProvider, useTheme) and `packages/shared/brand/*` (BrandMark, Logo) to that package. Web continues to use `globals.css` as its rendering source; the shared `tokens.ts` is the *canonical literal* and there must be a **CI parity check** that diffs `tokens.ts` against the `@theme` block so the two can never drift. Owner to confirm the CI check is in scope for v1 (recommended: yes, it is cheap and prevents brand drift).

### 2.4 Dark-first + light-theme handling

**Cockpit (dark) is canonical and the default on mobile** — `<html className="dark">` on web (`layout.tsx:68`); on mobile the app launches in cockpit. The 3 alternate themes override the **same token names**:

- **`glass`** "Glass Cockpit" — blue-shifted accents only, bg scale unchanged (`globals.css:182-197`).
- **`sectional`** light/VFR-chart paper — `bg:#F6F1E8`, `text:#2C2721`, lighter surface shadows (`globals.css:200-232`).
- **`briefing`** light/pre-flight readout — `bg:#F4F5F7`, `text:#1A1D23` (`globals.css:235-267`).

Each ships as a sibling object in `tokens.ts` (`glass`, `sectional`, `briefing`) with identical shape. The Settings theme picker (§6, parity with web Settings) swaps the active theme object in the `ThemeProvider`; the choice persists (see §2.5).

**iOS/Android system appearance:** the app is brand-dark-first and does **not** auto-follow OS light/dark — it follows the *user's chosen HeyDPE theme*. The status bar style is set per active theme (`light-content` on cockpit/glass; `dark-content` on sectional/briefing) via `expo-status-bar`. The native splash background is `c-bg` (`#080c12`).

#### Qualitative requirements
- Every token literal in `tokens.ts` is byte-identical to its `globals.css` counterpart.
- No screen reads a raw hex; all color comes through `useTheme()`.
- Theme switch is instant and global (every surface, the brand mark, the status bar restyle together).
- Light themes (sectional/briefing) render with their lighter surface-shadow recipes (§4), not the dark inner-shadow recipe.

#### Measurable success criteria
- [ ] CI parity check: `tokens.ts` cockpit values === `globals.css:9-43` values — **0** diffs (fails the build otherwise).
- [ ] Static scan: **0** hex-literal color strings (`/#[0-9a-fA-F]{3,8}/`) in any file under `apps/mobile/app/**` and `apps/mobile/components/screens/**`.
- [ ] All 4 themes selectable from Settings; selection survives app restart (persisted) — 4/4 pass.
- [ ] Status bar contrast: legible on all 4 theme backgrounds (manual pass/fail, both notch and non-notch devices).
- [ ] Switching theme re-tints the BrandMark with **0** stale colors (visual check across all 4).

---

## 3. Typography

### 3.1 Fonts on native — IBM Plex Sans + JetBrains Mono via `expo-font`

Web loads two Google fonts via `next/font/google` (`layout.tsx:3,10-20`). Mobile **bundles the font files** (no runtime Google fetch — reliability + offline) and loads them with **`expo-font`**.

**Weights to bundle (mirror web exactly):**
- **IBM Plex Sans:** 300, 400, 500, 600 (`layout.tsx:19`).
- **JetBrains Mono:** 400, 500, 600, 700, 800 (`layout.tsx:13`).

```ts
// apps/mobile/app/_layout.tsx
import { useFonts } from 'expo-font';
const [loaded] = useFonts({
  'IBMPlexSans-Light':    require('@/assets/fonts/IBMPlexSans-Light.ttf'),       // 300
  'IBMPlexSans-Regular':  require('@/assets/fonts/IBMPlexSans-Regular.ttf'),     // 400
  'IBMPlexSans-Medium':   require('@/assets/fonts/IBMPlexSans-Medium.ttf'),      // 500
  'IBMPlexSans-SemiBold': require('@/assets/fonts/IBMPlexSans-SemiBold.ttf'),    // 600
  'JetBrainsMono-Regular':  require('@/assets/fonts/JetBrainsMono-Regular.ttf'), // 400
  'JetBrainsMono-Medium':   require('@/assets/fonts/JetBrainsMono-Medium.ttf'),  // 500
  'JetBrainsMono-SemiBold': require('@/assets/fonts/JetBrainsMono-SemiBold.ttf'),// 600
  'JetBrainsMono-Bold':     require('@/assets/fonts/JetBrainsMono-Bold.ttf'),    // 700
  'JetBrainsMono-ExtraBold':require('@/assets/fonts/JetBrainsMono-ExtraBold.ttf'),//800
});
```

The splash screen (`expo-splash-screen`) is held visible until `loaded === true`, then `SplashScreen.hideAsync()`. RN has no `font-weight: 600` → family mapping; **the weight is selected by `fontFamily` name**, so the shared `<Text>` primitives map a `weight` prop to the correct family string. **Never** rely on `fontWeight` to fake a weight that isn't bundled (RN falls back to system font).

#### Measurable success criteria
- [ ] All 9 font files bundle and load; `loaded` flips true before first paint (no system-font flash — verified on a cold start screen-recording).
- [ ] Both fonts render in a probe screen at every bundled weight (visual check: 4 Plex weights, 5 mono weights).
- [ ] App does not present any UI before fonts are ready (splash stays up) — pass/fail.
- [ ] Total added bundle weight from fonts documented (target **< 1.2 MB** across all 9 files, subset to latin) — measured artifact.

### 3.2 Type scale → RN

Mapped from `flight-deck-application-guide.md:24-40` and the numeric scale `redesign-spec.md:57` (H1 28/32, H2 20, section-label 12 caps, body 15–16, micro-label 12, gauge value 26 tabular). On native, "interior page" scale is the baseline (the giant landing-hero is a web-marketing moment; the mobile app is interior-screen-first).

| Role | RN `fontSize` / `lineHeight` | Family / weight | Color | Case | Glow |
|------|------|------|------|------|------|
| **Screen title (H1)** | 28 / 34 | Plex SemiBold (600) | `text` | sentence | no |
| **Section H2** | 20 / 26 | Plex SemiBold (600) | `text` | sentence | no |
| **Card title (H3)** | 16 / 22 | Plex Medium (500) | `text` | sentence | no |
| **Lead / subhead** | 16 / 24 | Plex Regular (400) | `muted` | sentence | no |
| **Body / prose** | 15 / 24 (~1.6) | Plex Regular (400) | `text` | sentence | no |
| **Secondary** | 13 / 18 | Plex Regular (400) | `muted` | sentence | no |
| **Faint (floor)** | 12 / 16 | Plex Regular (400) | `dim` | sentence | no |
| **Micro-label** `// Label` | 12 / 14, `letterSpacing: 2` (≈0.3em) | JetBrainsMono Medium (500) | `cyan` swatch | UPPER (after `//`) | no |
| **Annunciator / badge** | 12 / 14, `letterSpacing: 1` | JetBrainsMono SemiBold (600) | role color | UPPER | live only |
| **ACS / element code** | 12–13, `letterSpacing: 0.5` | JetBrainsMono Medium (500) | `cyan-readable`/`text` | UPPER | no |
| **Numeric readout (stat)** | 26 / 30, `fontVariant:['tabular-nums']` | JetBrainsMono SemiBold (600) | role color | digits | live only |
| **Gauge value** | 26, tabular | JetBrainsMono | role color | digits | live only |

**Hard floors (verbatim discipline):** body/prose **≥ 14** practical (web `text-sm`); secondary **≥ 12** (`text-xs`); **never 10px** ("kill every 10px", `flight-deck-application-guide.md:36`). On mobile the **hard floor is 12pt** for any text and **44pt** minimum touch target regardless of text size. Reading prose measure caps at ~62–66ch (`redesign-spec.md:54`) — on a phone this is naturally satisfied by screen width with comfortable horizontal padding (§4).

> **Note on the 26pt numeric readout vs Dynamic Type:** the gauge value is a numeric instrument readout, not body prose. It still scales (see §3.3) but uses tighter scaling bounds so a giant accessibility setting doesn't shatter a gauge layout (capped, with the digits then truncating/ellipsizing gracefully rather than overflowing the ring).

#### Measurable success criteria
- [ ] **0** text nodes render below **12pt** at default Dynamic Type (static scan + runtime assert in dev).
- [ ] Body prose line-height ratio is **1.55–1.65** (≈1.6) on all reading surfaces (examiner question, answer, feedback).
- [ ] Every numeric stat uses `fontVariant: ['tabular-nums']` (so 0/2/28 align like a readout) — grep check on stat components.
- [ ] Micro-labels render letter-tracked uppercase mono at 12pt with the `//` prefix — visual check per screen that has one.

### 3.3 Dynamic Type / `fontScale` support + bounds

The app **respects OS text-size settings** (iOS Dynamic Type / Android font scale) — this is both an accessibility requirement and an App Store quality expectation.

**Mechanism:** RN exposes `PixelRatio.getFontScale()` and `useWindowDimensions().fontScale`. The shared `<Text>` primitives multiply their base size by a **clamped** scale so layout never shatters:

```ts
// packages/shared/theme/typography.ts
const clampScale = (s: number, min = 1.0, max = 1.6) => Math.min(Math.max(s, min), max);
// reading roles: max 1.6 (up to ~XXL). instrument/numeric roles: max 1.3 (protect gauges/badges).
```

- **Reading roles** (body, titles, secondary): allow scale **up to 1.6×** (covers iOS Dynamic Type up through the larger non-AX sizes and a chunk of the AX range).
- **Instrument roles** (micro-label, annunciator, ACS code): allow up to **1.3×** — they are short, fixed-form, and live inside tight pills; unbounded growth breaks the annunciator metaphor.
- **Numeric/gauge** values: up to **1.3×**, then digits constrained inside the gauge ring.
- Global `allowFontScaling` is **on** for reading text and **bounded** (via `maxFontSizeMultiplier`) for instrument text — never globally disabled (disabling Dynamic Type is an accessibility regression).

iOS: also set `UIFontMetrics`-style scaling implicitly via RN's font-scaling; no `Info.plist` opt-out. Android: `fontScale` honored; the shared primitive sets `maxFontSizeMultiplier` per role.

#### Qualitative requirements
- At the OS "Larger Text" max (non-AX), every core screen remains usable: nothing clips, no text is cut off, primary actions stay reachable.
- Instrument chrome (tab labels, badges, ACS codes) stays compact and legible, not ballooning past its container.
- Reading content (examiner question, the answer the user typed, assessment feedback) grows fully so low-vision users can read it.

#### Measurable success criteria
- [ ] App tested at iOS Dynamic Type sizes **xS, L (default), xxxL**, and Android font scale **0.85, 1.0, 1.3** — all 7 core screens pass "no clipping / no overlap / all CTAs reachable" (matrix artifact, pass/fail per cell).
- [ ] Reading text grows ≥ **1.6×** at max non-AX setting; instrument text grows **≤ 1.3×** (measured).
- [ ] **0** screens where a primary button label truncates at 1.3× scale.
- [ ] `allowFontScaling={false}` appears **only** on the gauge-digit component (if anywhere), justified in a code comment — grep audit.

---

## 4. Spacing, radii, elevation & surfaces

### 4.1 Spacing scale

A single 4pt-based scale (mirrors Tailwind's used steps). Exposed as `t.space`:

| Token | pt/dp | Typical use |
|---|---|---|
| `space.1` | 4 | hairline gaps, icon-to-label |
| `space.2` | 8 | tight stack, chip padding-y |
| `space.3` | 12 | list-row inner, card inner tight |
| `space.4` | 16 | **default screen horizontal padding**, card inner |
| `space.5` | 20 | section gap |
| `space.6` | 24 | card-to-card, generous card inner |
| `space.8` | 32 | major section break |
| `space.10` | 40 | hero / screen-top breathing room |

- **Default screen content inset:** 16pt horizontal (`space.4`), respecting `useSafeAreaInsets()` top/bottom.
- Cards: "generous padding" (`flight-deck-application-guide.md:51`) → **16–20pt** inner.

### 4.2 Radii (`redesign-spec.md:61`)

| Surface | Radius (pt) | Web equiv |
|---|---|---|
| Panels / cards | **12** | `rounded-xl` |
| Buttons / inputs | **8** | `rounded-lg` |
| Pills / annunciators / badges | **6** | `rounded-md` |
| Gauge rings | **full** (circle) | `rounded-full` |
| Focus indicator corner | **4** | `globals.css:278` |
| Sheets (top corners) | **per platform** — see §4.4 / §5.7 |

### 4.3 Surfaces — bezel / station / iframe rendered natively

The web uses **one shared depth recipe** (the "instrument cluster" metaphor) inlined into three classes (`globals.css:78-94`). RN cannot do `inset` box-shadow or multi-layer CSS shadow natively, so each surface is a **shared component** that reproduces the look with native primitives.

**`.bezel` — raised instrument glass / cards** (`globals.css:78-81`):
- Web: `linear-gradient(135deg, c-bezel 0%, c-panel 50%, c-bezel 100%)` + `inset 0 1px 0 rgba(255,255,255,.04), inset 0 0 12px rgba(0,0,0,.25), 0 4px 20px rgba(0,0,0,.5)`.
- **Native `<Bezel>`:** `expo-linear-gradient` 135° (`c-bezel → c-panel → c-bezel`); a **1px top highlight** drawn as a `borderTopColor: rgba(255,255,255,0.04)` (or a thin absolutely-positioned line) to emulate the inset top highlight; outer drop shadow via platform elevation (§4.5). Border `1px solid c-border`, radius **12**.

**`.iframe` — recessed well** (`globals.css:84-88`):
- Web: `1px solid c-border` + `inset 0 1px 0 rgba(255,255,255,.03), inset 0 0 12px rgba(0,0,0,.45)` + `linear-gradient(180deg, c-panel 0%, c-bg 100%)`.
- **Native `<InstrumentWell>`:** `expo-linear-gradient` 180° (`c-panel → c-bg`); a subtle **inner dark vignette** emulated with an inner absolutely-positioned gradient overlay (top→bottom dark) to fake the recessed inset; **no outer drop shadow** (recessed). Border `1px c-border`, radius 12.

**`.station` — the ONE "powered, in-focus" surface** (active exam console / armed cards) (`globals.css:91-94`):
- Web: `background: c-elevated-2` + `inset 0 1px 0 rgba(255,255,255,.04), inset 0 0 12px rgba(0,0,0,.35), 0 4px 20px rgba(0,0,0,.5)` + usage convention `ring-1 ring-c-amber/20` (`flight-deck-application-guide.md:52-53`).
- **Native `<Station>`:** solid `c-elevated2` fill; top inset highlight line; outer drop shadow (elevation); **plus** a `1px` amber ring at **20% opacity** (`borderColor: rgba(245,166,35,0.20)`, `borderWidth: 1`) to reproduce `ring-c-amber/20`. Radius 12. This is the **only** routinely-amber-ringed surface (active examiner station, armed/ready cards).

Card composition convention (parity with `flight-deck-application-guide.md:51`): `<Bezel>` + 12pt radius + `c-border` 1px border, generous inner padding.

### 4.4 Sheets / modals surface

Native bottom sheets and modals (§5.7, §6) sit on `c-bezel`/`c-panel`, top corners radius **per platform** (iOS form-sheet uses the system detent corner radius; Android Material bottom sheet uses 16dp top corners). A grabber handle (iOS) / drag handle (Material) sits at top in `c-border-hi`.

### 4.5 Elevation — iOS vs Material 3 (the explicit platform split)

RN shadows differ by platform and this **must** be handled deliberately:

- **iOS:** uses `shadowColor`, `shadowOffset`, `shadowOpacity`, `shadowRadius`. Map the web `0 4px 20px rgba(0,0,0,.5)` outer drop to: `shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowRadius:10 (≈20/2), shadowOpacity:0.5`. iOS shadows are soft and color-true; the dark-on-dark drop reads as a subtle lift.
- **Android (Material 3):** ignores iOS `shadow*` and uses **`elevation`** (a single dp number) which renders a **tonal + key/ambient** shadow. Inset shadows and the soft `rgba(0,0,0,.5)` glow do **not** translate; use `elevation` levels and Material 3 **tonal surface overlay** instead. Recommended mapping: bezel card = `elevation: 2`, station/active = `elevation: 4`, sheets = `elevation: 8`. The inset top-highlight and inner vignette are drawn the same way on both platforms (they're just views/gradients), so the "instrument glass" look survives even though the *outer* shadow is platform-native.
- **Shared `<Surface elevation="card|active|sheet">`** prop abstracts this: it emits iOS `shadow*` and Android `elevation` from one prop so authors never branch by hand.

#### Qualitative requirements
- A card on iOS and the same card on Android both read as "raised instrument glass" — same gradient, border, radius, top-highlight; only the outer shadow mechanism differs (and that difference is invisible to the eye, just native-correct).
- `.station` is visibly the *one* lit, amber-ringed, in-focus surface; it is not overused.
- Recessed wells (`.iframe`) read as *into* the panel; raised cards read as *above* it.

#### Measurable success criteria
- [ ] Radii exact: panels **12**, buttons/inputs **8**, pills **6**, focus corner **4**, gauges **full** — measured against component styles (5/5).
- [ ] iOS card shadow params === the documented mapping (offset 0/4, radius 10, opacity 0.5) — code check.
- [ ] Android cards use `elevation` (not iOS `shadow*` which Android ignores); levels: card 2, active 4, sheet 8 — code check.
- [ ] `.station` + amber-ring(20% opacity) appears on the active exam console and armed cards **only** (audit: no decorative use elsewhere).
- [ ] Default screen horizontal inset is **16pt** and respects safe-area on every notch/no-notch device tested (pass/fail).

---

## 5. Component library

Every component lives in `packages/shared/ui` (logic + tokens) or `apps/mobile/components/ui` (native-specific), is built on the shared theme, meets the touch-target floor (**≥ 44pt iOS / 48dp Android**), and maps to an iOS HIG and a Material 3 equivalent. **No screen invents a variant outside this list without an OWNER DECISION.**

### 5.1 Buttons

Rules from `flight-deck-application-guide.md:42-48`: **no `font-mono`, no `uppercase`**, `font-semibold`, ~15pt, sentence-case labels ("Start free trial", "Sign in", "Manage subscription").

| Variant | Style | iOS HIG equiv | Material 3 equiv |
|---|---|---|---|
| **Primary** | `bg: c-amber`, pressed `c-amber-bright`, label `c-bg`, radius 8, `font-semibold 15`, Plex | Filled / prominent button | Filled button |
| **Secondary** | `bg: c-bezel`, pressed `c-border`, label `c-text`, `1px c-border`, radius 8 | Gray/tinted button | Tonal / outlined button |
| **Tertiary / text** | transparent, label `c-amber`, no border | Plain button | Text button |
| **Destructive** | label/`c-red`; confirm before firing | Destructive (red) | Error button |

- Pressed state via `Pressable` (`opacity` or color swap), not hover.
- Hero CTA adds an amber glow shadow (parity with `shadow-lg shadow-c-amber/20`): iOS `shadowColor:c-amber, shadowOpacity:0.2`; Android `elevation` + amber tint. Glow on CTAs is allowed (§7).
- **Min height 44pt** (`min-h-11` parity, `flight-deck-application-guide.md:57`); 48dp on Android via `hitSlop` + min height.

#### Measurable
- [ ] Every button ≥ **44pt (iOS) / 48dp (Android)** tap target — automated layout assert.
- [ ] **0** button labels are uppercase or mono (grep).
- [ ] Primary label-on-amber contrast (`c-bg #080c12` on `c-amber #f5a623`) ≥ 4.5:1 (computed in §8).

### 5.2 Cards

`<Bezel>` (§4.3) + radius 12 + `c-border` 1px + 16–20pt inner padding. Active/armed = `<Station>` + amber ring.

- **HIG equiv:** grouped/inset content container.
- **Material 3 equiv:** Elevated / Outlined Card.

#### Measurable
- [ ] Cards use the shared `<Bezel>`/`<Station>` (no ad-hoc `View` with hand-rolled shadows) — audit.
- [ ] `.station` ring opacity = **20%** amber (matches `ring-c-amber/20`).

### 5.3 Inputs (text field, textarea, select)

- Surface: `<InstrumentWell>` (`.iframe`) recessed feel; `1px c-border`; radius 8.
- Text: `c-text`; placeholder: `c-dim` (floor — never below); label above in `c-muted` or a `// micro-label`.
- **Focus:** 2px amber outline + offset 2 (parity `globals.css:275-279`); the answer textarea additionally gets the amber inner glow on focus (parity `.fb-textarea:focus`, `globals.css:169-171`) — iOS/Android: an amber 1px border + soft amber shadow on focus.
- **Select / picker:** native — iOS uses a wheel/menu picker or `formSheet`; Android uses a Material exposed-dropdown / bottom sheet. Theme picker, rating picker, study-mode picker use this.
- **HIG:** Text Field / Picker. **Material 3:** Text field (filled/outlined) / Menu.

#### Measurable
- [ ] Input min height ≥ **44pt/48dp**; tap anywhere in the row focuses it.
- [ ] Placeholder color = `c-dim` exactly; **never** lighter than the dim floor.
- [ ] Focused input shows the 2px amber ring (cyan on light themes) — visual check, all themes.

### 5.4 Badges / annunciators

Caps-mono pills that read like cockpit annunciator lights. `<Annunciator status="sat|unsat|partial|active|info">`.

| Status | Color token | Label example |
|---|---|---|
| Satisfactory | `c-green-readable` text on `c-green-lo` fill | `Satisfactory` |
| Unsatisfactory | `c-red` text on `c-red-dim`-tinted fill | `Unsatisfactory` |
| Partial | `c-amber` text on `c-amber-lo` fill | `Partial` |
| Active / live | `c-amber-bright` + optional `annun-pulse` | `Active` |
| Info / data | `c-cyan-readable` on `c-cyan-lo` | `Recording` |

- Font: JetBrainsMono SemiBold, UPPER, `letterSpacing 1`, ~12pt; radius **6** (pill).
- **Green/red/cyan TEXT must use `-readable`/lifted variants** (the `-readable` rule) — base `c-green`/`c-cyan` are fills only.
- Live status may pulse via `annun-pulse` (1.6s soft cross-fade, **not a strobe**, `globals.css:294-299`); respects reduced-motion (§7).
- **HIG:** label / badge. **Material 3:** Assist/Suggestion chip or Badge.
- Interactive badges (tappable filter chips) hit **44pt/48dp**.

#### Measurable
- [ ] Annunciator text uses `-readable`/AA-safe variant (never base `c-green`/`c-cyan` for the text) — audit.
- [ ] Pulsing annunciators stop pulsing when "Reduce Motion" is on — pass/fail.
- [ ] Pill radius = **6**; contrast of label-on-fill ≥ 4.5:1 (§8 pairs).

### 5.5 List rows

For session history (Progress), settings, instructor lists.

- Row: `c-panel`/transparent on a `<Bezel>` group; hairline `c-border` separators; leading icon/brand-mark optional; title `c-text` (Plex Medium 16, sentence-case); subtitle `c-muted` 13; trailing chevron (iOS) / no chevron + ripple (Android) / value/badge.
- Codes (ACS) inside a row render as a `<CodeChip>` (mono, 12–13, `c-cyan-readable`/`c-text`).
- **Row min height 44pt/48dp**; full-row tap target.
- **HIG:** Table view inset-grouped row (with disclosure chevron). **Material 3:** List item (one/two/three-line) with state-layer ripple.

#### Measurable
- [ ] Row height ≥ **44pt/48dp**; entire row is the touch target (not just the title).
- [ ] iOS rows show a disclosure chevron when they navigate; Android rows use ripple feedback — platform check.
- [ ] Separators are `c-border` 1px hairlines (not heavier).

### 5.6 Tab bar (bottom)

The 4 primary destinations (§6). Default to the **stable JS `Tabs`** from expo-router (research: `NativeTabs` is alpha as of 2026-06-11; isolate it if adopted later).

- Background: `c-panel` with a top hairline `c-border`; **safe-area bottom inset** honored.
- Active tab: amber (`c-amber`) icon + label; inactive: `c-muted`.
- Label: Plex, **sentence-case 12pt** (this is a system tab label, not an annunciator — NOT caps-mono).
- Icons: §9.
- **HIG:** standard Tab Bar. **Material 3:** Navigation Bar.
- Each tab item hit ≥ **44pt/48dp** (tab bar height ≥ 49pt iOS content + safe area).

#### Measurable
- [ ] Exactly **4** tabs (Home, Practice, Progress, Settings); labels sentence-case 12pt (not mono-caps).
- [ ] Active = `c-amber`, inactive = `c-muted`; contrast of both on `c-panel` ≥ 4.5:1 (§8).
- [ ] Tab bar respects bottom safe-area on home-indicator devices (no overlap) — pass/fail.

### 5.7 Sheets

Native modal sheets for: session config / pre-exam scope, upgrade/paywall, theme picker, confirmations.

- expo-router stack route with `presentation: 'formSheet'` (iOS draggable detents, `sheetAllowedDetents`, grabber, corner radius) or `presentation: 'modal'` (full card). Lightweight ephemeral overlays may use RN `<Modal>`.
- Surface: `c-bezel`/`c-panel`, top corners rounded (iOS system detent radius / Material 16dp), grabber `c-border-hi`.
- **HIG:** Sheet (page sheet / form sheet, detents). **Material 3:** Bottom sheet (modal/standard).
- Sheet primary action = Primary button (§5.1).

#### Measurable
- [ ] Sheets dismiss via drag-down AND an explicit Close/Cancel control (both present) — pass/fail.
- [ ] iOS uses `formSheet` detents where a partial-height sheet is intended; Android uses Material bottom sheet — platform check.
- [ ] Grabber/handle visible at top; sheet does not cover the status bar content unintentionally.

### 5.8 Nav bar (top)

Per-screen header on stacks.

- **iOS:** large-title nav bar (`headerLargeTitle: true`) on top-level screens (Home/Progress/Settings roots), collapsing to inline title on scroll; back-chevron; brand `<Logo size="md" />` may sit as the large title's companion on Home. Title text Plex SemiBold sentence-case `c-text`; background `c-panel` with bottom hairline `c-border`.
- **Android (Material 3):** top app bar (small/center-aligned), up-arrow, optional brand mark; title Plex `c-text`.
- Right-side actions: icon buttons (§9) ≥ 44/48.
- **HIG:** Navigation bar (large title). **Material 3:** Top app bar.

#### Measurable
- [ ] iOS top-level roots use large-title; pushed detail screens use inline title + back chevron — platform check.
- [ ] Android uses a Material top app bar with up-affordance — check.
- [ ] Header title is sentence-case Plex (NOT caps-mono) — audit.

---

## 6. Navigation system (expo-router IA)

**Library:** expo-router (file-based). Note the SDK 56 change: expo-router **no longer depends on `@react-navigation/*`** — build everything through expo-router's own API; no direct `@react-navigation/*` imports.

### 6.1 Route tree

```
apps/mobile/app/
  _layout.tsx                 # root Stack (loads fonts/theme, gates auth)
  (auth)/
    _layout.tsx               # Stack, no tab bar
    login.tsx                 # Email OTP + Google/Apple/Microsoft (Apple at parity, §HIG)
    signup.tsx
  (tabs)/
    _layout.tsx               # Tabs (JS Tabs) — Home, Practice, Progress, Settings
    home/index.tsx            # Dashboard home (stats, tips)
    practice/index.tsx        # Exam interface (chat + voice)
    progress/index.tsx        # Session history + ACS coverage
    settings/index.tsx        # Account, voice, theme, delete account
  session-config.tsx          # presentation: 'formSheet' — pre-exam scope
  upgrade.tsx                 # presentation: 'formSheet' — paywall (IAP / RevenueCat)
  onboarding.tsx              # presentation: 'modal' — AI-consent gate (§HIG 5.1.2(i))
  exam/[id].tsx               # active exam (pushed full-screen over Practice)
  +not-found.tsx
```

The **7 core screens** (PARITY v1): Home, Practice (+ active exam), Progress, Settings, Login/Signup, Onboarding, Upgrade/Paywall — mirroring the web's `(dashboard)` set plus the consent + purchase gates the store requires.

### 6.2 Pattern — tabs nested inside an outer stack

A `(tabs)` group nested in the root `Stack` so **modals/sheets present over the tab bar** (the standard production pattern). Modals are routes with a `presentation` option — no separate modal API:
- `presentation: 'modal'` — onboarding consent (full card).
- `presentation: 'formSheet'` — session config, upgrade/paywall (iOS detents + grabber).
- `presentation: 'transparentModal'` — lightweight confirms / toasts if needed.
- Deep-linked modals in nested stacks export `unstable_settings` to anchor the back stack.

### 6.3 Bottom tabs

Home · Practice · Progress · Settings (§5.6). Default JS `Tabs`. `NativeTabs` (alpha) NOT adopted in v1 unless re-verified at submission (research VERIFY-AT-SUBMISSION item).

### 6.4 Headers — large-title (iOS) vs Material top app bar (Android)

- iOS top-level roots: `headerLargeTitle: true`; detail screens: inline + back chevron (§5.8). The active `exam/[id]` screen presents full-screen with a minimal header (an annunciator-style "Active" status + an end-exam action), reflecting the focused console.
- Android: Material 3 top app bar with up-affordance.

### 6.5 Gestures & system back

- iOS: interactive swipe-back enabled on stack screens (HIG expectation); sheets drag-to-dismiss.
- Android: hardware/gesture **Back** mapped to stack pop / sheet dismiss; never traps the user.

#### Qualitative requirements
- IA mirrors the web's 7 core screens; nothing essential is buried.
- Modals/sheets feel native (detents, grabber, swipe-dismiss), not like web overlays.
- Auth and onboarding-consent gates sit *outside* the tabs so they can present before the tab UI.

#### Measurable success criteria
- [ ] Exactly 4 bottom tabs; deep links resolve to the correct route incl. modals (`exam/[id]`, `upgrade`) — link-test matrix.
- [ ] iOS swipe-back works on every pushed screen; Android system Back never dead-ends (every screen has a defined back target) — pass/fail per screen.
- [ ] **0** direct `@react-navigation/*` imports (grep) — all navigation via expo-router.
- [ ] Sheets present over the tab bar (tab bar not visible behind a full modal but the modal stack is rooted above tabs) — visual check.
- [ ] Onboarding AI-consent modal cannot be skipped before first exam (required gate per HIG 5.1.2(i)) — pass/fail.

---

## 7. Motion & haptics

### 7.1 Motion — glow only on instrument moments, no decorative continuous animation

Verbatim discipline (`flight-deck-application-guide.md:54-55`, `globals.css:120-166,285-299`):

- **No decorative continuous animation on static content.** `ipulse` and global `flicker` are **not** used on app surfaces. **Glow ONLY on hero/brand moment, CTAs, and live status** (`.glow-a`/`.glow-g`/`.glow-c` = text-shadow `0 0 10px @40% + 0 0 30px @10%`, `globals.css:73-75`).
- **Native glow:** RN `<Text>` has no `text-shadow` web parity but supports `textShadowColor` / `textShadowRadius` / `textShadowOffset`. Glow primitive: `textShadowColor: rgba(amber,0.4), textShadowRadius: 8` (approximating the 10px inner glow); the outer 30px halo is dropped on native (it's a subtle web CRT touch, not load-bearing). Applied to: the "DPE" wordmark (when `glow`), hero/brand moment, primary CTA, and **live** status annunciators only.
- **Annunciator pulse** (`.annun-pulse`, `globals.css:294-299`): single soft cockpit pulse, **1.6s**, opacity 1→0.55 — **not a strobe**. Annunciator state cross-fades **180ms** (`redesign-spec.md:63`). On RN: `Animated`/Reanimated opacity loop 1→0.55 over 1.6s for live status; 180ms cross-fade on state change.
- **Allowed-but-restraint:** staggered entrance reveal (web `.s1`–`.s6`, `su` 0.6s ease-out, 0.1–0.6s stagger) may be used sparingly for a screen's first paint; the mic-level bar (`.mic-bar`, 1.2s) is permitted **only** on the live recording control.
- **Transitions:** use native stack/sheet transitions (iOS push/zoom, Material). No custom theatrical page transitions.
- **Scanline:** the web CRT scanline (`globals.css:57-70`, cyan `rgba(0,212,255,0.022)`) is a fixed full-screen overlay. **OWNER DECISION — scanline on mobile:** *default = OFF.* At 0.022 it's nearly invisible and on OLED phones a global fixed overlay risks battery/scroll cost and a "broken screen" read on a paid tool. **Recommendation: ship without the scanline in v1; keep the cockpit feel via surfaces + accents + the mark.** If the owner wants it, gate it behind a Settings "CRT scanline" toggle, default off, and disable under reduce-motion. Owner to confirm.

### 7.2 Reduced motion

`prefers-reduced-motion` parity (`globals.css:285-292`): on RN, read **`AccessibilityInfo.isReduceMotionEnabled()`** + subscribe to changes. When ON: disable annunciator pulse, mic-bar animation, entrance stagger, and any optional scanline; keep instant state changes (no cross-fade longer than ~100ms). Static glow (a non-animated text-shadow) may remain since it's not motion, but **animated** glow pulses stop.

### 7.3 Haptics vocabulary (`expo-haptics`)

A small, consistent vocabulary — haptics are punctuation, not decoration:

| Event | Haptic | API |
|---|---|---|
| Primary CTA / start exam | Medium impact | `impactAsync(Medium)` |
| Toggle / selection change (theme, study mode) | Selection tick | `selectionAsync()` |
| Assessment = Satisfactory | Success notification | `notificationAsync(Success)` |
| Assessment = Unsatisfactory | Warning notification | `notificationAsync(Warning)` |
| Error / blocked action (trial limit, network) | Error notification | `notificationAsync(Error)` |
| Recording start / stop | Light impact | `impactAsync(Light)` |

- Haptics fire on **meaningful** events only; never on scroll or every keystroke.
- Respect a Settings "Haptics" toggle (default on) and the OS haptics setting.

#### Qualitative requirements
- The app feels calm and instrument-grade — no looping decorative motion, no strobing.
- Glow appears only where the brand earns it (mark, CTA, live status); everything else is matte.
- Haptics reinforce the exam's key moments (start, sat/unsat, record) and nothing else.

#### Measurable success criteria
- [ ] **0** continuous decorative animations on static content (audit: only live status pulse, mic bar, and first-paint stagger animate).
- [ ] With "Reduce Motion" ON, all animated pulses/stagger/scanline are disabled — pass/fail across screens.
- [ ] Glow (`textShadow`) appears on ≤ the allowed set (mark, hero, primary CTA, live annunciator) — audit, no decorative glow.
- [ ] Haptic events match the table 1:1; **0** haptics on scroll or per-keystroke (manual check).
- [ ] Annunciator pulse period measured at **1.6s ± 0.1s**; never < 0.6s (no strobe) — measured.

---

## 8. Accessibility baseline

### 8.1 Contrast — token pairs that pass 4.5:1 on the cockpit (dark) theme

The cockpit text tokens were deliberately lifted for AA (`globals.css:39-43`: `c-muted` is "the single biggest WCAG fix"; `c-dim` is the floor). The `-readable` cyan/green exist **specifically** so colored text clears 4.5:1 (`flight-deck-application-guide.md:38-40`). **Authors MUST pick text colors from this passing list:**

| Foreground token | On background | Intended use | Status |
|---|---|---|---|
| `c-text` `#d7dee6` | `c-bg` `#080c12` | Primary reading text | **PASS** (≥ 4.5:1) — primary body |
| `c-text` `#d7dee6` | `c-bezel` `#161b22` | Reading text on cards | **PASS** |
| `c-text` `#d7dee6` | `c-elevated2` `#1e2530` | Reading text on station | **PASS** |
| `c-muted` `#aab4c0` | `c-bg` `#080c12` | Secondary text | **PASS** (the lifted muted) |
| `c-dim` `#9aa4b2` | `c-bg` `#080c12` | Faint text (floor) | **PASS — and the floor; never go below** |
| `c-cyan-readable` `#4fd8ff` | `c-bg` `#080c12` | Cyan TEXT (data, micro-labels-as-text) | **PASS** (this is why `-readable` exists) |
| `c-green-readable` `#4be88e` | `c-bg` `#080c12` | Green TEXT ("Satisfactory") | **PASS** |
| `c-amber` `#f5a623` | `c-bg` `#080c12` | Amber headline/accent text & code | **PASS** |
| `c-bg` `#080c12` | `c-amber` `#f5a623` | Primary button label on amber | **PASS** (dark text on amber fill) |
| `c-red` `#ff5a4d` | `c-bg` `#080c12` | Danger/UNSAT text (lifted for AA) | **PASS** |

**Do NOT use for text** (fills/icons/gauges only — fail or are reserved as non-text): base `c-cyan` `#00d4ff` and base `c-green` `#19e66b` as **body text** (use the `-readable` variants); `c-amber-dim`, `c-*-dim`, `c-*-lo` (these are gradient/fill tokens). `c-muted`/`c-dim` are validated on `c-bg`; on lighter surfaces (`c-elevated2`) they remain ≥ 4.5:1, but the **floor is `c-dim` — never introduce a fainter text color.**

> **Measurable contrast gate:** a CI/test fixture computes WCAG contrast for every (text-token, surface-token) pair the app actually uses and **fails** if any reading-text pair is < 4.5:1 or any large-text/UI pair is < 3:1. Light themes (sectional/briefing) get the same gate with their own literals.

### 8.2 VoiceOver / TalkBack

- Every interactive element has an `accessibilityLabel` (sentence-case, human — e.g. "Start free trial", not "btn_cta"); `accessibilityRole` (`button`, `header`, `link`, `image`, `adjustable` for gauges/sliders); `accessibilityState` (`disabled`, `selected`, `checked`).
- The **BrandMark** carries `accessibilityRole="image"` + label "HeyDPE" (parity with `Brand.tsx:27-28` `role="img" aria-label`).
- **Annunciators** announce their status as text ("Satisfactory", "Unsatisfactory") — color is never the only signal; the label text + an optional shape/icon convey state (color-blind safe).
- Live status changes (recording started, assessment scored) use `AccessibilityInfo.announceForAccessibility()` so screen-reader users are told.
- Decorative elements (gradients, the inset highlight lines, optional scanline) are `accessibilityElementsHidden` / `importantForAccessibility="no"`.

### 8.3 Focus order & navigation

- Logical reading order top-to-bottom, left-to-right; group related controls (`accessibilityRole="header"` for section titles so VO/TalkBack users can jump).
- Modals/sheets trap focus inside while open and restore focus to the trigger on dismiss.
- The 2px amber focus indicator (parity `globals.css:275-279`) renders for **external keyboard / switch-control** focus on RN where supported; never glow-only (focus is an outline, not a glow).

### 8.4 Hit targets

- **≥ 44pt iOS / 48dp Android** for every tappable element (buttons, tabs, list rows, badges-that-act, icon buttons). Where the visual is smaller (e.g. a 24pt icon button), expand via `hitSlop`/min size.

#### Qualitative requirements
- A blind user can complete the core loop (sign in → consent → start exam → answer → read assessment → end) entirely via VoiceOver/TalkBack.
- No information is conveyed by color alone; status always has a text label.
- Text scales (§3.3) and contrast holds in every theme.

#### Measurable success criteria
- [ ] **100%** of interactive elements expose `accessibilityLabel` + correct `accessibilityRole` (automated a11y scan + manual VO/TalkBack pass on all 7 screens).
- [ ] Contrast CI gate: **0** reading-text pairs < 4.5:1, **0** UI/large pairs < 3:1, across all 4 themes (artifact: the contrast report).
- [ ] **0** text colors fainter than `c-dim`; **0** cyan/green *text* using the non-`-readable` base token (audit).
- [ ] Every tappable element ≥ **44pt/48dp** (automated measurement) — 0 failures.
- [ ] Full VoiceOver run and full TalkBack run of the core loop each complete with **0** unreachable/ unlabeled controls (recorded pass).
- [ ] Color-blind check: every status badge distinguishable without color (label present) — pass/fail.

---

## 9. Iconography

### 9.1 Style

- **Outline / line icons**, ~1.75pt stroke, geometric — matching the instrument/technical aesthetic; not filled, not playful.
- **Default library:** `@expo/vector-icons` (Ionicons / Material Community) for system glyphs (tabs, chevrons, settings rows, close, mic) — they read native on each platform and ship bundled.
- **Brand/instrument icons** (the attitude-indicator mark, any cockpit-specific glyph) are **custom `react-native-svg`** built from tokens (so they re-tint per theme), living in `packages/shared/brand` / `packages/shared/icons`.
- Icon color follows context: inactive/utility `c-muted`; active/selected `c-amber`; data accents may use `c-cyan` (icon, not text); success/danger use `c-green`/`c-red` (icons/fills, where the non-readable base is fine because it's not text).

### 9.2 Sizing & targets

- Tab icons **24–28pt**; nav/header icon buttons **24pt** glyph inside a **≥44/48** target; list-row leading icons **20–24pt**; inline status dots 8–10pt (decorative, paired with a text label).
- A single optical size system: don't mix wildly different stroke weights on one screen.

### 9.3 Platform nuance

- iOS may use SF Symbols-equivalent metaphors (chevron.right for disclosure); Android uses Material equivalents (no disclosure chevron by default, ripple instead). The shared icon component picks the right glyph per platform for system affordances (back, disclosure, overflow).

#### Qualitative requirements
- Icons are consistent in stroke and metaphor; brand instrument icons re-tint with the theme; system icons feel native.
- No icon is the sole carrier of meaning without an accessible label.

#### Measurable success criteria
- [ ] All custom/brand icons built from theme tokens (re-tint correctly across 4 themes) — visual audit.
- [ ] Icon buttons sit in a ≥ **44/48** target (hitSlop where the glyph is small) — measured.
- [ ] **0** icons below 16pt used as a sole tappable affordance.
- [ ] Every meaningful icon has an `accessibilityLabel` (or is `importantForAccessibility="no"` if decorative) — audit.

---

## 10. Web ↔ native parity & drift control

- **Single literal source:** `packages/shared/theme/tokens.ts` ↔ `globals.css @theme`, kept in lockstep by the CI parity check (§2.3).
- **Single brand source:** `packages/shared/brand` (BrandMark/Logo) ↔ `src/components/Brand.tsx` (same geometry, same tokens).
- **Single typography rule:** §1.2 verbatim from `flight-deck-application-guide.md` — both platforms obey it.
- When the web tokens change, the change lands in `tokens.ts` first (or simultaneously) and the CI check guards drift.

#### Measurable
- [ ] CI parity check is green on every PR; a deliberate token edit on one side without the other **fails** CI (proven once).

---

## 11. Compliance checklist (screen-author self-verify)

Run this against **every** screen before opening a PR. A box that can't be checked is a blocker or an explicit OWNER DECISION.

**Typography & brand**
- [ ] No body prose, button, nav, list-row title, or settings label is caps-mono. (§1.2)
- [ ] Caps-mono used only via `<MicroLabel>` / `<Annunciator>` / `<CodeChip>` / numeric readout. (§1.2)
- [ ] Wordmark = "Hey" `c-text` + "DPE" `c-amber`; mark legible ≥ 16pt. (§1.3)
- [ ] **No text below 12pt** at default Dynamic Type; reading prose ~1.6 line-height. (§3.2)
- [ ] Numeric stats use `tabular-nums`. (§3.2)

**Color & tokens**
- [ ] **0** hex literals in the screen file; all color via `useTheme()`. (§2.3)
- [ ] Cyan/green **text** uses `-readable`; base cyan/green only for fills/icons. (§2.2, §8.1)
- [ ] Faintest text is `c-dim` — nothing fainter. (§8.1)

**Surfaces, spacing, elevation**
- [ ] Cards = `<Bezel>` r12 + `c-border`; active/armed = `<Station>` + amber-ring 20%. (§4.3)
- [ ] Radii: panel 12 / button 8 / pill 6 / gauge full / focus 4. (§4.2)
- [ ] Elevation via shared `<Surface>` (iOS `shadow*`, Android `elevation`) — no hand-rolled platform shadow. (§4.5)
- [ ] 16pt horizontal screen inset; safe-area respected. (§4.1)

**Components & targets**
- [ ] Every tappable element ≥ **44pt iOS / 48dp Android**. (§5, §8.4)
- [ ] Buttons sentence-case, Plex, `font-semibold`, correct variant. (§5.1)
- [ ] Inputs show 2px amber focus ring (cyan on light); answer textarea has amber focus glow. (§5.3)
- [ ] Annunciators: `-readable` text, radius 6, pulse only when live + reduce-motion-safe. (§5.4)

**Navigation**
- [ ] Routes via expo-router only (no `@react-navigation/*` imports). (§6)
- [ ] iOS large-title roots / inline detail; Android Material top app bar. (§5.8, §6.4)
- [ ] Sheets dismiss by drag AND explicit control; present over tabs. (§5.7)

**Motion & haptics**
- [ ] No decorative continuous animation on static content; glow only on mark/hero/CTA/live status. (§7.1)
- [ ] Reduce-motion disables pulses/stagger/scanline. (§7.2)
- [ ] Haptics match the §7.3 table; none on scroll/keystroke.

**Accessibility**
- [ ] 100% interactive elements have `accessibilityLabel` + `accessibilityRole`. (§8.2)
- [ ] No meaning by color alone (status has a text label). (§8.2)
- [ ] Contrast: all reading-text pairs ≥ 4.5:1 (use the §8.1 passing list). (§8.1)
- [ ] Full VoiceOver + TalkBack reachability of the screen's actions. (§8.2)

**Iconography**
- [ ] Brand icons token-driven (re-tint per theme); system icons native per platform. (§9)
- [ ] Icon-only buttons have a target ≥ 44/48 and an accessible label. (§9.2)

---

## 12. Open OWNER DECISIONS (consolidated)

1. **App icon / splash composition** — instrument-only (recommended) vs instrument + wordmark; final exported 1024² + adaptive icon assets. (§1.3)
2. **`packages/shared/theme` + `brand` in the shared package + CI parity check** — confirm in scope for v1 (recommended yes). (§2.3)
3. **CRT scanline on mobile** — recommended OFF in v1 (battery/scroll/"broken screen" risk on OLED at 0.022). If wanted, ship as a default-off Settings toggle, reduce-motion-disabled. (§7.1)
4. **Alternate themes at launch** — cockpit is canonical/default; ship glass/sectional/briefing in v1 (full parity) or defer the 3 alternates to v1.x? (Tokens are ready either way.) (§2.4)
5. **`NativeTabs`** — stay on stable JS `Tabs` for v1 (recommended); re-evaluate at submission if it leaves alpha. (§5.6, §6.3)
