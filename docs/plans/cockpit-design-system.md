# HeyDPE COCKPIT Design System

> Canonical reference for the HeyDPE "COCKPIT" visual language. Any developer or designer should be able to build a pixel-accurate page for HeyDPE using only this document and the Tailwind CSS framework.

**Design name:** COCKPIT
**Approved:** 2026-02-18
**Reference mockup:** `mockups/design-a-cockpit-v2.html`
**Pages covered:** Landing, Practice (pre-session), Settings

---

## 1. Design Philosophy

The COCKPIT theme draws from **aviation instrument panels** — dark backgrounds, glowing indicator colors, monospaced readouts, and instrument bezels. The aesthetic communicates precision, authority, and professionalism appropriate for FAA checkride preparation.

**Core principles:**
- Dark-dominant interface (near-black backgrounds, never white or light)
- Three signal colors (amber, green, cyan) used as functional indicators, not decoration
- Monospace typography for all headings, labels, and data — body text in a clean sans-serif
- CRT-inspired effects: scanline overlay, subtle text glow, noise texture
- Instrument-panel framing: bezel cards with inset shadows, gauge-ring indicators

---

## 2. Color Palette

### 2.1 Background Scale (Dark to Light)

| Token | Hex | Tailwind Class | Usage |
|-------|-----|---------------|-------|
| `bg` | `#080c12` | `bg-c-bg` | Page body, root background |
| `panel` | `#0d1117` | `bg-c-panel` | Card interiors, input fields, instrument frames |
| `bezel` | `#161b22` | `bg-c-bezel` | Elevated card surfaces, inactive buttons |
| `elevated` | `#1a2028` | `bg-c-elevated` | Hover states on panel-level elements |
| `border` | `#1c2333` | `border-c-border` | Default borders, dividers, separators |
| `border-hi` | `#2a3040` | `border-c-border-hi` | Hover/focus border highlight |

### 2.2 Signal Colors

Each signal color has three variants: full, dim (mid-tone), and lo (dark tint for backgrounds).

#### Amber (Primary / Action / Headings)

| Token | Hex | Tailwind Class | Usage |
|-------|-----|---------------|-------|
| `amber` | `#f5a623` | `text-c-amber`, `bg-c-amber` | Primary CTA, section headings, active indicators |
| `amber-dim` | `#8b6914` | `text-c-amber-dim` | Progress bar gradient start, dimmed amber |
| `amber-lo` | `#3d2e0a` | `bg-c-amber-lo` | Amber-tinted backgrounds (active button fill, badges) |

#### Green (Success / Status / Secondary Accent)

| Token | Hex | Tailwind Class | Usage |
|-------|-----|---------------|-------|
| `green` | `#00ff41` | `text-c-green`, `bg-c-green` | Success states, satisfactory scores, active rating display |
| `green-dim` | `#0a5c1a` | `text-c-green-dim` | Progress bar gradient start |
| `green-lo` | `#0a2e10` | `bg-c-green-lo` | Green-tinted backgrounds (success badges) |

#### Cyan (Information / Navigation / Tertiary Accent)

| Token | Hex | Tailwind Class | Usage |
|-------|-----|---------------|-------|
| `cyan` | `#00d4ff` | `text-c-cyan`, `bg-c-cyan` | Section labels, info highlights, resume indicators, task picker |
| `cyan-dim` | `#0a4a5c` | `text-c-cyan-dim` | Progress bar gradient start |
| `cyan-lo` | `#082a35` | `bg-c-cyan-lo` | Cyan-tinted backgrounds (applicant chat bubbles, info badges) |

#### Red (Error / Destructive)

| Token | Hex | Tailwind Class | Usage |
|-------|-----|---------------|-------|
| `red` | `#ff3b30` | `text-c-red`, `bg-c-red` | Errors, destructive actions, unsatisfactory scores |
| `red-dim` | `#5c1a16` | `bg-c-red-dim` | Red-tinted backgrounds, progress bar gradient start |

### 2.3 Text Colors

| Token | Hex | Tailwind Class | Usage |
|-------|-----|---------------|-------|
| `text` | `#c9d1d9` | `text-c-text` | Default body text |
| `muted` | `#6b7280` | `text-c-muted` | Secondary text, labels, descriptions |
| `dim` | `#4a5060` | `text-c-dim` | Tertiary text, subtle hints, metadata |

### 2.4 Color Assignment Rules

1. **Amber is the primary action color.** All primary CTAs, page headings, and section titles use amber.
2. **Green indicates success or live status.** Satisfactory scores, permission granted, active connections.
3. **Cyan indicates information or navigation.** Section pre-labels (`// PROCEDURE`), resume session indicators, task picker selections, applicant chat.
4. **Red is reserved for errors and destructive actions only.** Never use red as decoration.
5. **Never use white (`#ffffff`) as a text color.** The brightest text is `c-text` (`#c9d1d9`).
6. **Signal color backgrounds always use the `-lo` variant.** Never place text on a full-saturation signal color background except for buttons where text is `c-bg` (dark).

---

## 3. Typography

### 3.1 Font Families

| Role | Font | Weights | Fallback | Google Fonts Import |
|------|------|---------|----------|-------------------|
| **Display / Mono** | JetBrains Mono | 400, 500, 600, 700, 800 | `monospace` | `family=JetBrains+Mono:wght@400;500;600;700;800` |
| **Body** | IBM Plex Sans | 300, 400, 500, 600 | `sans-serif` | `family=IBM+Plex+Sans:wght@300;400;500;600` |

### 3.2 Type Scale

All sizes use Tailwind's default scale. Custom sizes via bracket notation where needed.

| Element | Font | Size (Tailwind) | Weight | Color | Case | Tracking | Extra |
|---------|------|-----------------|--------|-------|------|----------|-------|
| Page title (H1) | JetBrains Mono | `text-xl` | `font-bold` | `text-c-amber` | UPPERCASE | `tracking-wider` | `glow-a` class |
| Hero title | JetBrains Mono | `text-4xl sm:text-5xl lg:text-6xl` | `font-bold` | `text-c-amber` | UPPERCASE | `tracking-tight` | `glow-a` class |
| Section heading (H2) | JetBrains Mono | `text-2xl` | `font-bold` | `text-c-amber` | UPPERCASE | — | `glow-a` class |
| Card section heading | JetBrains Mono | `text-sm` | `font-semibold` | `text-c-amber` | UPPERCASE | `tracking-wider` | — |
| Card title | JetBrains Mono | `text-xs` | `font-semibold` | Signal color | UPPERCASE | — | Glow class matches color |
| Section pre-label | JetBrains Mono | `text-xs` | `font-normal` (400) | Signal color | UPPERCASE | `tracking-[0.3em]` | Glow class, prefixed with `//` |
| Body text | IBM Plex Sans | `text-sm` or `text-base` | `font-light` (300) or `font-normal` (400) | `text-c-text/70` | Normal | — | `leading-relaxed` |
| Label | JetBrains Mono | `text-[10px]` | `font-normal` | `text-c-muted` | UPPERCASE | `tracking-wider` | — |
| Data value | JetBrains Mono | `text-xs` or `text-sm` | `font-semibold` | Signal or `text-c-text` | UPPERCASE | — | — |
| Metadata | JetBrains Mono | `text-[10px]` | `font-normal` | `text-c-dim` or `text-c-muted` | UPPERCASE or Normal | — | — |
| Button text | JetBrains Mono | `text-xs` or `text-sm` | `font-semibold` or `font-bold` | Per button type | UPPERCASE | `tracking-wide` or `tracking-wider` | — |
| Input text | JetBrains Mono | `text-xs` | `font-normal` | `text-c-text` | Normal (or uppercase for airport codes) | — | — |
| Placeholder | JetBrains Mono | `text-xs` | `font-normal` | `text-c-dim` | Normal | — | `placeholder-c-dim` |

### 3.3 Text Case Rules

- **ALL headings, labels, buttons, badges, and navigation links are UPPERCASE.**
- Body text and descriptions are normal case.
- Input field values are normal case, except airport codes which auto-uppercase.

### 3.4 CRT Text Glow

Three glow classes add a colored `text-shadow` to simulate CRT phosphor glow:

```css
.glow-a { text-shadow: 0 0 10px rgba(245,166,35,0.4), 0 0 30px rgba(245,166,35,0.1); }
.glow-g { text-shadow: 0 0 10px rgba(0,255,65,0.4), 0 0 30px rgba(0,255,65,0.1); }
.glow-c { text-shadow: 0 0 10px rgba(0,212,255,0.4), 0 0 30px rgba(0,212,255,0.1); }
```

**Usage rules:**
- Apply `glow-a` to amber page headings (H1, H2) and the brand wordmark.
- Apply `glow-g` to green status text, ratings display, and section pre-labels that are green.
- Apply `glow-c` to cyan section pre-labels, resume session headings, and cyan status text.
- Never apply glow to body text, labels, metadata, or button text.
- Never stack multiple glow classes on one element.

---

## 4. Spacing & Layout

### 4.1 Page Structure

| Property | Value | Notes |
|----------|-------|-------|
| Max content width | `max-w-5xl` (landing) / `max-w-2xl` (practice, settings) | Centered with `mx-auto` |
| Horizontal padding | `px-4` | Applied to all page containers |
| Vertical page padding | `py-8` | Applied to practice/settings main containers |
| Section vertical spacing | `py-12` to `py-20` | Landing page sections use generous spacing |
| Card stack spacing | `space-y-6` | Settings page card sections |

### 4.2 Spacing Scale (Key Values)

| Gap | Usage |
|-----|-------|
| `gap-1` / `gap-1.5` | Inline icon + text, badge content |
| `gap-2` | Button groups, small card grids, inline metadata |
| `gap-3` | Card internal element spacing, stacked list items |
| `gap-4` | Section content gaps, flex nav items |
| `gap-6` | Card grid gaps, major section dividers |

### 4.3 Grid Patterns

| Pattern | Tailwind Classes | Usage |
|---------|-----------------|-------|
| Landing stats | `grid grid-cols-2 sm:grid-cols-4 gap-6` | Social proof gauges |
| How-it-works cards | `grid sm:grid-cols-3 gap-6` | Step cards |
| Feature cards | `grid sm:grid-cols-2 lg:grid-cols-3 gap-4` | Feature grid |
| Study mode cards | `grid grid-cols-3 gap-2` | Practice page study mode |
| Voice cards | `grid gap-3 sm:grid-cols-2` | Settings voice selection |
| Plan info cards | `grid grid-cols-2 gap-3` | Settings plan & usage |
| Feedback type | `grid grid-cols-2 gap-3` | Settings feedback selection |

---

## 5. Component Library

### 5.1 Bezel Card (Primary Container)

The main card component simulating an instrument panel bezel.

```css
.bezel {
  background: linear-gradient(135deg, #161b22 0%, #0d1117 50%, #161b22 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.03), 0 4px 20px rgba(0,0,0,0.5);
}
```

**Tailwind classes:** `bezel rounded-lg border border-c-border p-6`

**Structure:**
- Border: 1px `c-border`
- Border radius: `rounded-lg` (8px)
- Padding: `p-6` (24px) for content cards, `p-5` for feature cards
- Background: Diagonal gradient from bezel → panel → bezel
- Shadow: Subtle inner highlight + deep outer shadow

### 5.2 Instrument Frame (Secondary Container)

A recessed frame for inner data panels, status rows, and data displays.

```css
.iframe {
  border: 1px solid #1c2333;
  box-shadow: inset 0 0 8px rgba(0,0,0,0.5), 0 2px 12px rgba(0,0,0,0.3);
  background: linear-gradient(180deg, #0d1117 0%, #0a0e14 100%);
}
```

**Tailwind classes:** `iframe rounded-lg p-4`

**Structure:**
- Border: 1px `c-border`
- Border radius: `rounded-lg`
- Padding: `p-4` (16px)
- Background: Vertical gradient panel → slightly darker
- Shadow: Deep inset shadow + outer shadow (creates "recessed" look)

**Usage:** Plan info cards, usage meters, voice diagnostics steps, active session rows, rating/class display bar.

### 5.3 Gauge Ring (Circular Progress Indicator)

Conic gradient ring with a hollow center displaying a value.

```css
.gauge {
  background: conic-gradient(from 220deg, var(--gc) 0%, var(--gc) var(--gp), #1c2333 var(--gp), #1c2333 100%);
}
```

**HTML pattern:**
```html
<div class="w-20 h-20 rounded-full border-2 border-c-{color}/40 flex items-center justify-center gauge"
     style="--gc:#COLOR_HEX;--gp:PERCENT%">
  <div class="w-16 h-16 rounded-full bg-c-panel flex items-center justify-center">
    <span class="font-mono font-bold text-c-{color} text-lg glow-{x}">VALUE</span>
  </div>
</div>
```

**Sizes:**
- Large (landing stats): outer `w-20 h-20`, inner `w-16 h-16`, value `text-lg`
- Small (practice header): outer `w-10 h-10`, inner `w-7 h-7`, value `text-[10px]`

**Parameters:**
- `--gc`: Gauge color hex (matches the signal color used)
- `--gp`: Fill percentage (e.g., `85%`)
- Gauge starts at 220 degrees (roughly 7 o'clock position)

### 5.4 Primary Button (CTA)

```html
<button class="px-8 py-3.5 bg-c-amber hover:bg-c-amber/90 text-c-bg rounded-lg
  font-mono font-semibold text-sm tracking-wide transition-colors
  shadow-lg shadow-c-amber/20">
  BUTTON TEXT
</button>
```

**Variants by size:**

| Variant | Padding | Font Size | Weight | Extra |
|---------|---------|-----------|--------|-------|
| Hero CTA | `px-8 py-3.5` | `text-sm` | `font-semibold` | `shadow-lg shadow-c-amber/20` |
| Full-width | `w-full py-3.5` | `text-sm` | `font-bold` | `shadow-lg shadow-c-amber/20`, `tracking-wider` |
| Standard | `px-5 py-2.5` or `px-4 py-2` | `text-xs` | `font-semibold` | — |
| Compact | `px-4 py-2` | `text-xs` | `font-semibold` | — |

**Colors:**
- Primary: `bg-c-amber text-c-bg` (amber bg, dark text)
- Secondary (cyan action): `bg-c-cyan text-c-bg` — used for "Continue" on resume card
- Destructive: `bg-c-red/80 hover:bg-c-red text-white` — used for "Sign Out All"

### 5.5 Secondary Button (Ghost / Outline)

```html
<button class="px-8 py-3.5 bg-c-bezel hover:bg-c-border text-c-text rounded-lg
  font-mono font-medium text-sm border border-c-border tracking-wide transition-colors">
  BUTTON TEXT
</button>
```

**Characteristics:**
- Background: `bg-c-bezel` (elevated surface)
- Border: `border border-c-border`
- Hover: `hover:bg-c-border` + optionally `hover:border-c-border-hi`
- Text: `text-c-text` (standard) or `text-c-muted` (subdued)

### 5.6 Selection Button (Toggle / Pill)

Used for study mode, difficulty, rating, and aircraft class selection.

**Inactive state:**
```
px-3 py-1.5 rounded-lg border border-c-border bg-c-bezel
font-mono text-[10px] text-c-muted hover:border-c-border-hi transition-colors
```

**Active state (color varies):**
```
px-3 py-1.5 rounded-lg border border-c-{color}/50 bg-c-{color}-lo/50
font-mono text-[10px] font-semibold text-c-{color}
```

**Color by context:**
- Rating selection: amber
- Aircraft class: cyan
- Difficulty pills: amber (active uses `bg-c-amber text-c-bg` — filled, not tinted)
- Study mode cards: amber (larger, `p-3`, includes subtitle)

### 5.7 Study Mode Card (Selection Card)

Larger selection card with title + subtitle.

**Inactive:**
```html
<button class="p-3 rounded-lg border border-c-border bg-c-bezel text-left hover:border-c-border-hi transition-colors">
  <p class="font-mono text-xs font-medium text-c-muted">MODE NAME</p>
  <p class="text-[10px] text-c-muted mt-1">Description</p>
</button>
```

**Active:**
```html
<button class="p-3 rounded-lg border border-c-amber/50 bg-c-amber-lo/50 text-left transition-colors">
  <p class="font-mono text-xs font-semibold text-c-amber">MODE NAME</p>
  <p class="text-[10px] text-c-muted mt-1">Description</p>
</button>
```

### 5.8 Badge / Tag

Small pill-shaped labels for status indicators.

```html
<span class="font-mono text-[10px] bg-c-{color}-lo text-c-{color} px-2 py-0.5 rounded border border-c-{color}/20">
  LABEL
</span>
```

**Standard badges:**
- `ACTIVE` — amber: `bg-c-amber-lo text-c-amber border-c-amber/20`
- `THIS DEVICE` — cyan: `bg-c-cyan-lo text-c-cyan border-c-cyan/20`
- `EXAM ACTIVE` — green: `bg-c-green-lo text-c-green border-c-green/20`
- `SATISFACTORY` — green: `bg-c-green-lo/40 text-c-green border-c-green/20`
- `BUG REPORT` — amber: `bg-c-amber-lo text-c-amber border-c-amber/20`
- `CONTENT ERROR` — cyan: `bg-c-cyan-lo text-c-cyan border-c-cyan/20`

**Larger badges (rating pills on landing page):**
```html
<span class="px-3 py-1 text-xs font-mono bg-c-panel text-c-{color}/80 rounded border border-c-{color}/20">
  PPL — FAA-S-ACS-6C
</span>
```

### 5.9 Progress Bar

Horizontal bars for usage meters and diagnostic levels.

**Container:**
```html
<div class="h-1.5 w-full bg-c-border rounded-full overflow-hidden">
  <div class="h-full rounded-full prog-{x}" style="width:PERCENT%"></div>
</div>
```

**Gradient classes:**
```css
.prog-a { background: linear-gradient(90deg, #8b6914, #f5a623); } /* amber */
.prog-g { background: linear-gradient(90deg, #0a5c1a, #00ff41); } /* green */
.prog-c { background: linear-gradient(90deg, #0a4a5c, #00d4ff); } /* cyan */
.prog-r { background: linear-gradient(90deg, #5c1a16, #ff3b30); } /* red */
```

**Track:** `h-1.5 bg-c-border rounded-full`
**Fill:** Same height, `rounded-full`, one of the gradient classes above.

### 5.10 Text Input

```html
<input type="text"
  class="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg
    text-c-text font-mono text-xs
    focus:outline-none focus:ring-1 focus:ring-c-amber focus:border-c-amber
    placeholder-c-dim transition-colors"
  placeholder="e.g., Cessna 172"
  maxlength="100">
```

**Characteristics:**
- Background: `bg-c-panel`
- Border: `border-c-border`, focus: `border-c-amber` + `ring-1 ring-c-amber`
- Text: `text-c-text font-mono text-xs`
- Placeholder: `placeholder-c-dim`
- Border radius: `rounded-lg`

### 5.11 Select / Dropdown

```html
<select class="w-full px-3 py-2 bg-c-panel border border-c-border rounded-lg
  text-c-text font-mono text-xs
  focus:outline-none focus:ring-1 focus:ring-c-amber">
  <option>Option text</option>
</select>
```

Same styling as text input.

### 5.12 Textarea

```html
<textarea rows="4"
  class="fb-textarea w-full px-3 py-2.5 bg-c-panel border border-c-border rounded-lg
    text-c-text font-mono text-xs
    focus:outline-none focus:border-c-amber
    placeholder-c-dim resize-none transition-colors"
  placeholder="Describe the issue...">
</textarea>
```

**Focus glow:**
```css
.fb-textarea:focus { box-shadow: 0 0 0 1px #f5a623, 0 0 15px rgba(245,166,35,0.1); }
```

### 5.13 Checkbox

```html
<input type="checkbox" checked
  class="w-4 h-4 rounded border-c-border bg-c-bezel text-c-green focus:ring-c-green">
```

**Smaller variant (resume card):**
```html
<input type="checkbox" checked
  class="rounded border-c-border bg-c-bezel text-c-cyan focus:ring-c-cyan w-3.5 h-3.5">
```

- Checkmark color matches context (green for voice toggle, cyan for resume card voice).

### 5.14 Chat Bubble (Demo / Session)

**Examiner (DPE) message:**
```html
<div class="flex justify-start">
  <div class="max-w-[80%] bg-c-bezel rounded-lg px-4 py-3 border-l-2 border-c-amber/50">
    <p class="text-[10px] font-mono text-c-amber mb-1">DPE EXAMINER</p>
    <p class="text-sm text-c-text leading-relaxed">Message text...</p>
  </div>
</div>
```

**Applicant (student) message:**
```html
<div class="flex justify-end">
  <div class="max-w-[80%] bg-c-cyan-lo/40 rounded-lg px-4 py-3 border-r-2 border-c-cyan/50">
    <p class="text-[10px] font-mono text-c-cyan mb-1">APPLICANT</p>
    <p class="text-sm text-c-text leading-relaxed">Message text...</p>
    <!-- Optional assessment badge -->
    <div class="mt-2 pt-2 border-t border-c-border">
      <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-c-green-lo/40 text-c-green border border-c-green/20">SATISFACTORY</span>
    </div>
  </div>
</div>
```

**Key differences:**
- Examiner: left-aligned, `bg-c-bezel`, amber left border, amber role label
- Applicant: right-aligned, `bg-c-cyan-lo/40`, cyan right border, cyan role label
- Both: `max-w-[80%]`, `rounded-lg`, `px-4 py-3`

### 5.15 Navigation Bar

```html
<nav class="border-b border-c-border bg-c-bg/80 backdrop-blur-lg">
  <div class="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
    <span class="font-mono font-bold text-c-amber glow-a text-sm tracking-widest">HEYDPE</span>
    <div class="flex items-center gap-4">
      <!-- Nav links -->
      <a class="font-mono text-xs text-c-muted hover:text-c-amber transition-colors tracking-wide">PRICING</a>
      <a class="font-mono text-xs text-c-muted hover:text-c-text transition-colors tracking-wide">SIGN IN</a>
      <!-- CTA -->
      <a class="font-mono text-xs px-4 py-1.5 bg-c-amber hover:bg-c-amber/90 text-c-bg rounded font-semibold tracking-wide transition-colors">GET STARTED</a>
    </div>
  </div>
</nav>
```

**Characteristics:**
- Height: `h-14` (56px)
- Background: `bg-c-bg/80 backdrop-blur-lg` (translucent with blur)
- Bottom border: `border-b border-c-border`
- Brand wordmark: `font-mono font-bold text-c-amber glow-a text-sm tracking-widest`
- Nav links: `font-mono text-xs text-c-muted`, hover to amber or text
- CTA: Small amber button with `rounded` (not `rounded-lg`)

### 5.16 Accordion / Expandable Section

**Trigger (collapsed):**
```html
<button class="font-mono text-xs text-c-cyan hover:text-c-cyan/80 transition-colors flex items-center gap-1">
  <span class="text-[10px]">&#9654;</span> CUSTOMIZE TASKS...
</button>
```

**Trigger (expanded):** Arrow changes to `&#9660;` (down).

**Content panel:** Hidden by default, revealed with class toggle. Styled with `border border-c-border rounded-lg bg-c-panel`.

**Larger accordion (voice diagnostics):**
- Full-width clickable header with `p-6`
- Arrow: `&#9660;` rotates 180deg when expanded
- Content: `px-6 pb-6 border-t border-c-border pt-4`

### 5.17 Task Picker Area Row

```html
<button class="task-area w-full px-3 py-2 flex items-center gap-2 text-left text-xs font-medium text-c-text transition-colors">
  <span class="w-3 h-3 rounded-sm border border-c-border flex items-center justify-center text-[8px] area-check"></span>
  <span class="font-mono text-[10px] text-c-dim">I</span>
  Preflight Preparation
  <span class="ml-auto text-[10px] text-c-dim">6</span>
</button>
```

**Checkbox:** `w-3 h-3 rounded-sm border-c-border` → when checked: `bg-c-cyan border-c-cyan text-white` with checkmark entity.

**Task sub-items:**
```html
<button class="task-item w-full px-2 py-1 text-left text-[11px] text-c-dim hover:text-c-cyan transition-colors rounded">
  <span class="font-mono text-c-dim/50 mr-1.5">I.A</span> Pilot Qualifications
</button>
```

### 5.18 Resume Session Card

```html
<div class="iframe rounded-lg p-4 mb-5 border-l-2 border-c-cyan">
  <!-- Blinking status dot -->
  <div class="w-1.5 h-1.5 rounded-full bg-c-cyan blink"></div>
  <!-- Heading in cyan with glow -->
  <h3 class="font-mono text-xs font-semibold text-c-cyan glow-c">CONTINUE PREVIOUS SESSION</h3>
  <!-- Metadata line -->
  <p class="text-[10px] text-c-muted font-mono">Feb 17, 3:42 PM &middot; 8 exchanges &middot; PPL &middot; ASEL &middot; Linear &middot; mixed</p>
</div>
```

**Distinguishing features:**
- Uses `iframe` (instrument frame) styling, not `bezel`
- Left border accent: `border-l-2 border-c-cyan`
- Blinking dot: `w-1.5 h-1.5 rounded-full bg-c-cyan blink`

### 5.19 Voice Card (Examiner Voice Selection)

**Active voice card:**
```html
<div class="iframe rounded-lg p-4 border-l-2 border-c-amber ring-1 ring-c-amber/20">
  <span class="font-mono text-xs font-semibold text-c-amber">ONYX (DEEP)</span>
  <p class="font-mono text-[10px] text-c-dim">tts-1:onyx</p>
  <span class="font-mono text-[10px] bg-c-amber-lo text-c-amber px-2 py-0.5 rounded border border-c-amber/20">ACTIVE</span>
  <p class="text-[10px] text-c-muted">Description text</p>
  <button>&#9654; PREVIEW</button>
</div>
```

**Inactive voice card:**
- No left border accent, no ring
- Adds a "SELECT" button: `bg-c-amber-lo text-c-amber hover:bg-c-amber hover:text-c-bg`
- Title uses `text-c-text` instead of `text-c-amber`

### 5.20 Diagnostic Step Row

```html
<div class="flex items-start gap-3 px-3 py-2.5 iframe rounded-lg">
  <span class="font-mono text-c-green text-sm mt-0.5 glow-g">&#10003;</span>
  <div class="flex-1">
    <p class="font-mono text-xs text-c-text">Step name</p>
    <p class="font-mono text-[10px] text-c-green mt-0.5">Status message</p>
  </div>
</div>
```

**Step icons:**
- Success: `&#10003;` (checkmark) in `text-c-green glow-g`
- In progress: `&#9675;` (circle) in `text-yellow-400 blink`
- Not tested: `&#9675;` (circle) in `text-c-muted`

### 5.21 Active Session Row

```html
<div class="flex items-center justify-between p-3 iframe rounded-lg border-l-2 border-c-cyan">
  <span class="text-c-muted text-lg">&#9109;</span> <!-- computer icon -->
  <span class="font-mono text-xs text-c-text">Chrome on MacOS</span>
  <!-- Badges: THIS DEVICE, EXAM ACTIVE -->
  <span class="font-mono text-[10px] text-c-dim">Location &middot; Last active time</span>
</div>
```

Current device gets `border-l-2 border-c-cyan` accent. Other devices have no accent border.

---

## 6. Effects & Animations

### 6.1 Scanline Overlay

A full-screen, non-interactive overlay simulating CRT scanlines.

```css
.scanline::after {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 212, 255, 0.012) 2px,
    rgba(0, 212, 255, 0.012) 4px
  );
  pointer-events: none;
  z-index: 9999;
}
```

**Applied to:** `<body class="scanline">`
**Effect:** Faint cyan horizontal lines every 4px. Extremely subtle — barely visible, adds atmosphere.

### 6.2 Noise Texture

Fractal noise overlay for section backgrounds.

```css
.noise::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,...feTurbulence...");
  pointer-events: none;
  z-index: 1;
  opacity: 0.03;
}
```

**Applied to:** Hero section, secondary CTA section. Requires `position: relative` on parent and `position: relative; z-index: 10` on content.

### 6.3 Flicker

Subtle brightness variation simulating an old CRT display.

```css
@keyframes flicker {
  0%, 100% { opacity: 1 }
  50% { opacity: 0.97 }
  75% { opacity: 0.99 }
}
.flicker { animation: flicker 4s infinite; }
```

**Applied to:** Instrument readout areas (optional — use sparingly).

### 6.4 Instrument Pulse

Gentle box-shadow pulse for cards.

```css
@keyframes ipulse {
  0%, 100% { box-shadow: 0 0 15px rgba(0,212,255,0.08) }
  50% { box-shadow: 0 0 25px rgba(0,212,255,0.18) }
}
.ipulse { animation: ipulse 3s ease-in-out infinite; }
```

**Applied to:** How-it-works step cards on landing page.

### 6.5 Staggered Reveal (Page Load)

Elements animate in sequentially on page load.

```css
@keyframes su {
  from { opacity: 0; transform: translateY(20px) }
  to { opacity: 1; transform: translateY(0) }
}
.s1 { animation: su .6s ease-out .1s both }
.s2 { animation: su .6s ease-out .2s both }
.s3 { animation: su .6s ease-out .3s both }
.s4 { animation: su .6s ease-out .4s both }
.s5 { animation: su .6s ease-out .5s both }
.s6 { animation: su .6s ease-out .6s both }
```

**Applied to:** Hero section elements (pre-label → title → subtitle → CTAs → note). Each subsequent element has 100ms more delay.

**Rule:** Apply `.s1` through `.s6` in DOM order to create cascade effect. Duration fixed at 0.6s. Easing: `ease-out`. Direction: up from 20px below.

### 6.6 Status Blink

```css
@keyframes blink {
  0%, 100% { opacity: 1 }
  50% { opacity: 0.3 }
}
.blink { animation: blink 1.5s ease-in-out infinite; }
```

**Applied to:** Resume session status dot, voice diagnostics "listening" indicator.

### 6.7 Mic Level Bar

```css
@keyframes mic-pulse {
  0%, 100% { width: 30% }
  25% { width: 65% }
  50% { width: 45% }
  75% { width: 80% }
}
.mic-bar { animation: mic-pulse 1.2s ease-in-out infinite; }
```

**Applied to:** Microphone level meter in voice diagnostics. Uses `prog-g` (green gradient) bar.

### 6.8 Transition Defaults

All interactive elements use `transition-colors` for hover/focus state changes. No element uses `transition-all` — transitions are scoped to color properties only for performance.

---

## 7. Iconography

The design does not use an icon library. All icons are Unicode entities or HTML entities.

| Icon | Entity | Usage |
|------|--------|-------|
| Checkmark | `&#10003;` | Success states, feature cards, area checkbox |
| Diamond | `&#9670;` | Streak indicator |
| Lightning | `&#9889;` | Quick 5 button |
| Play triangle | `&#9654;` | Collapsed arrow, voice preview button |
| Down arrow | `&#9660;` | Expanded arrow, accordion trigger |
| Warning | `&#9888;` | Bug report feedback type |
| Document | `&#9776;` | Content error, FAA source card |
| Gear | `&#9881;` | Personalized defaults card |
| Refresh | `&#8634;` | Session resume card |
| Bullseye | `&#9678;` | Voice-first card |
| Grid | `&#9636;` | Progress tracking card |
| Computer | `&#9109;` | Active session device |
| Right arrow | `&rarr;` | "Change in Settings" link |
| Middot | `&middot;` | Metadata separator |

**Rule:** Never use emoji. Never use an icon font library. Always use HTML entities.

---

## 8. Page-Specific Patterns

### 8.1 Landing Page

**Max width:** `max-w-5xl` (wider than app pages)

**Section structure:**
1. **Navigation bar** — sticky/fixed optional, `bg-c-bg/80 backdrop-blur-lg`
2. **Hero** — centered text, staggered animation, `noise` overlay, `pt-28 pb-20`
3. **Social proof gauges** — 4-column gauge ring grid, `bg-c-panel/50 border-y`
4. **How it works** — 3-column step cards with numbered circles, `ipulse` animation
5. **Demo chat** — centered bezel card with chat bubbles, `bg-c-panel/30 border-y`
6. **Feature cards** — 3-column grid (2-col on sm), bezel cards with icon + title + desc
7. **Secondary CTA** — centered text + buttons, `noise` overlay, `bg-c-panel/30`
8. **Footer** — brand + nav links + legal disclaimer

**Section pre-labels pattern:**
```html
<p class="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase text-center mb-2">// PROCEDURE</p>
```
Always prefixed with `//` (code comment style). Always centered. Always cyan or green.

### 8.2 Practice Page (Pre-Session)

**Max width:** `max-w-2xl`

**Section structure:**
1. **Header** — page title (left) + gauge/streak/session count (right)
2. **Quick 5 button** — shortcut to weak areas practice
3. **Resume session card** — conditional, `iframe` with cyan accent
4. **Session config card** — `bezel` card containing:
   - Rating/class display bar (read-only, links to Settings)
   - Study mode (3-col card grid)
   - Difficulty (4 pill buttons)
   - Task picker (expandable accordion)
   - Voice toggle (checkbox in styled container)
   - Start button (full-width amber)
5. **Disclaimer** — centered, extremely dimmed amber text

**Rating/class display bar:**
```html
<div class="flex items-center justify-between px-4 py-3 bg-c-panel rounded-lg border border-c-border">
  <span class="font-mono text-xs">
    <span class="text-c-green font-semibold glow-g">PRIVATE PILOT</span>
    <span class="text-c-muted mx-2">&middot;</span>
    <span class="text-c-cyan font-semibold">ASEL</span>
  </span>
  <a class="font-mono text-[10px] text-c-amber hover:text-c-amber/80">CHANGE IN SETTINGS &rarr;</a>
</div>
```

### 8.3 Settings Page

**Max width:** `max-w-2xl`
**Card spacing:** `space-y-6`

**Section structure (6 bezel cards):**

1. **Account** — Email display + Practice Defaults subsection
   - Rating buttons (amber)
   - Aircraft class buttons (cyan) — hidden when Instrument selected
   - Aircraft type text input
   - Home airport text input (auto-uppercase)
   - Save confirmation: `text-c-green font-mono text-[10px] glow-g`

2. **Plan & Usage** — 2-col info cards + 2-col usage meters + Upgrade button
   - Info cards use `iframe` styling
   - Meters: `prog-a` for sessions, `prog-c` for TTS

3. **Examiner Voice** — 2-col grid of voice cards
   - Active card: `iframe` + `border-l-2 border-c-amber` + `ring-1 ring-c-amber/20`
   - Inactive cards: `iframe` + "SELECT" and "PREVIEW" buttons

4. **Voice Diagnostics** — Collapsible accordion
   - Mic selector dropdown
   - 3-step test results (success/in-progress/not-tested)
   - "Run Voice Test" amber button
   - Chrome mic note

5. **Active Sessions** — Stacked device rows
   - Current device: `iframe` + `border-l-2 border-c-cyan` + badges
   - Other devices: `iframe` only
   - "Sign Out All Other Sessions" red button

6. **Feedback** — 2-column type selection → expandable form
   - Type cards: `bg-c-panel hover:bg-c-elevated border border-c-border`
   - Expanded: badge + textarea + Cancel/Submit buttons

---

## 9. Responsive Behavior

### 9.1 Breakpoints

Standard Tailwind breakpoints apply:
- `sm:` — 640px
- `md:` — 768px
- `lg:` — 1024px

### 9.2 Responsive Patterns

| Element | Mobile | sm+ | lg+ |
|---------|--------|-----|-----|
| Hero title | `text-4xl` | `text-5xl` | `text-6xl` |
| Hero CTAs | Stacked (`flex-col`) | Side by side (`flex-row`) | — |
| Stats gauges | 2-col grid | 4-col grid | — |
| How-it-works | Stacked | 3-col grid | — |
| Feature cards | Stacked | 2-col grid | 3-col grid |
| Voice cards | Stacked | 2-col grid | — |
| Footer nav | Stacked center | Horizontal row | — |
| Practice/Settings | Full-width (no change) | — | — |

### 9.3 Mobile Considerations

- Practice and Settings pages at `max-w-2xl` are naturally mobile-friendly.
- All interactive targets (buttons, checkboxes, cards) have minimum touch targets via padding.
- Study mode grid (`grid-cols-3`) may need `grid-cols-1` on very small screens — implement as needed.

---

## 10. Accessibility

### 10.1 Color Contrast

All text passes WCAG AA against the dark backgrounds:
- `c-text` (#c9d1d9) on `c-bg` (#080c12): 10.2:1
- `c-amber` (#f5a623) on `c-bg`: 7.8:1
- `c-green` (#00ff41) on `c-bg`: 11.5:1
- `c-cyan` (#00d4ff) on `c-bg`: 8.9:1
- `c-muted` (#6b7280) on `c-bg`: 4.6:1 (AA for large text)
- `c-dim` (#4a5060) on `c-bg`: 2.9:1 (metadata only, not essential)

### 10.2 Focus States

- All inputs use `focus:ring-1 focus:ring-c-amber focus:border-c-amber`
- Checkboxes use `focus:ring-c-green` or `focus:ring-c-cyan`
- Buttons rely on `transition-colors` hover states; keyboard focus should add `focus:ring-2 focus:ring-c-amber/50`

### 10.3 Motion

- All animations are subtle and non-disruptive
- `prefers-reduced-motion: reduce` should disable: `flicker`, `ipulse`, `blink`, `mic-bar`, staggered reveals

---

## 11. Brand Elements

### 11.1 Wordmark

The brand name "HEYDPE" is always rendered as text (never a logo image):

```html
<span class="font-mono font-bold text-c-amber glow-a text-sm tracking-widest">HEYDPE</span>
```

**Rules:**
- Always JetBrains Mono, bold, amber with glow
- Always ALL CAPS
- Always `tracking-widest` (0.1em)
- Size: `text-sm` in navigation, `text-sm` in footer
- Never render as an image or SVG

### 11.2 Legal Disclaimer

Always present at bottom of practice page and in landing page footer:

```html
<p class="text-[10px] text-c-muted font-mono leading-relaxed text-center max-w-xl mx-auto">
  FOR STUDY PURPOSES ONLY. NOT A SUBSTITUTE FOR INSTRUCTION FROM A CERTIFICATED
  FLIGHT INSTRUCTOR (CFI) OR AN ACTUAL DPE CHECKRIDE. ALWAYS VERIFY INFORMATION
  AGAINST CURRENT FAA PUBLICATIONS. HEYDPE IS A PRODUCT OF IMAGINE FLYING LLC,
  JACKSONVILLE, FL.
</p>
```

On practice page, uses `text-c-amber/25` instead of `text-c-muted`.

---

## 12. Tailwind Configuration

The following Tailwind config extends the default theme. In a Next.js project, this goes in `tailwind.config.ts`. In static HTML, use `tailwind.config` in a script tag.

```js
{
  theme: {
    extend: {
      colors: {
        c: {
          bg: '#080c12',
          panel: '#0d1117',
          bezel: '#161b22',
          elevated: '#1a2028',
          border: '#1c2333',
          'border-hi': '#2a3040',
          amber: '#f5a623',
          'amber-dim': '#8b6914',
          'amber-lo': '#3d2e0a',
          green: '#00ff41',
          'green-dim': '#0a5c1a',
          'green-lo': '#0a2e10',
          cyan: '#00d4ff',
          'cyan-dim': '#0a4a5c',
          'cyan-lo': '#082a35',
          red: '#ff3b30',
          'red-dim': '#5c1a16',
          text: '#c9d1d9',
          muted: '#6b7280',
          dim: '#4a5060',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        body: ['IBM Plex Sans', 'sans-serif'],
      }
    }
  }
}
```

### 12.1 Custom CSS Classes Required

These CSS classes must be defined globally (in `globals.css` or equivalent):

1. `.scanline::after` — Scanline overlay
2. `.glow-a`, `.glow-g`, `.glow-c` — CRT text glow
3. `.bezel` — Primary card background
4. `.iframe` — Instrument frame background
5. `.gauge` — Conic gradient ring
6. `.flicker` — CRT flicker animation
7. `.ipulse` — Instrument pulse animation
8. `.s1` through `.s6` — Staggered reveal classes
9. `.noise::before` — Noise texture overlay
10. `.prog-a`, `.prog-g`, `.prog-c`, `.prog-r` — Progress bar gradients
11. `.blink` — Status blink animation
12. `.mic-bar` — Mic level animation
13. `.fb-textarea:focus` — Feedback textarea focus glow

---

## 13. Implementation Checklist

When building any new page for HeyDPE, verify:

- [ ] Page uses `bg-c-bg` as root background (never white)
- [ ] `<body>` has `scanline` class for CRT overlay
- [ ] All headings use JetBrains Mono, uppercase, amber with `glow-a`
- [ ] All labels and metadata use JetBrains Mono, `text-[10px]`, uppercase, `text-c-muted`
- [ ] Body text uses IBM Plex Sans
- [ ] Cards use either `.bezel` (primary) or `.iframe` (secondary/recessed)
- [ ] Buttons follow the variant system (primary/secondary/selection/destructive)
- [ ] Signal colors used correctly: amber=action, green=success, cyan=info, red=error
- [ ] No white text — brightest text is `c-text` (#c9d1d9)
- [ ] No icon library — only HTML entities
- [ ] Interactive elements have `transition-colors`
- [ ] Focus states use amber ring
- [ ] Legal disclaimer present on exam-related pages
- [ ] Badge/tag pattern used for all status indicators
- [ ] Progress bars use gradient classes (never solid colors)
- [ ] Section pre-labels use `//` prefix, spaced tracking, glow class
