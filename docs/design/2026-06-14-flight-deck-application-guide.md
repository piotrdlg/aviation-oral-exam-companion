# FLIGHT DECK — Application Guide (W6B.3 completion sweep)

> The token foundation shipped (PR #32) but the **typography-discipline sweep
> was skipped**, leaving the interface at "competent dark SaaS." This guide is
> the exact rule set used to finish the redesign across every screen. The live
> references are `src/app/page.tsx` (landing), `src/app/pricing/page.tsx`, and
> `src/components/{Brand,Footer}.tsx`.

## The one rule that does most of the work

**If a string is longer than ~5 words OR is prose a user reads to comprehend,
it is IBM Plex sentence-case — never caps-mono.**

Caps-mono (`font-mono … uppercase`) is reserved for, and only for:
- the landing **hero H1** (the single brand instrument moment),
- **cockpit micro-labels** (`// Procedure`, `// Systems`) — small, tracked, colored,
- **status annunciators / badges** (`Satisfactory`, `Best value`, `Active`),
- **ACS / element codes** (`PA.I.B`, `FAA-S-ACS-6C`),
- **numeric instrument readouts** (gauge values, prices) — `font-mono tabular-nums`.

Everything else → Plex sentence-case.

## Headings

- Interior page H1 and every section H2/H3 → **sentence-case Plex bold**,
  `text-c-text`, `tracking-tight`, **no glow**. Sizes: H1 `text-4xl sm:text-5xl`,
  section H2 `text-3xl`, card H3 `text-base`.
- Pair a heading with a small mono micro-label above it for the cockpit accent:
  `<p className="font-mono text-xs text-c-cyan tracking-[0.3em] uppercase mb-3">// Label</p>`
  (micro-labels are sentence-case after the `//`, e.g. `// Comparison`; acronyms
  like `// FAQ` stay capped).

## Body & labels

- Body/prose ≥ `text-sm` (14px); lead/subhead `text-base`. Secondary text ≥ 12px
  (`text-xs`). **Never `text-[10px]`** — the audit's "kill every 10px."
- Reading text `text-c-text`; secondary `text-c-muted`; faint `text-c-dim` (floor).
- Cyan/green **text** uses the `-readable` variants (`text-c-cyan-readable`,
  `text-c-green-readable`) to clear 4.5:1.

## Buttons

- No `font-mono`, no `uppercase`. `font-semibold text-[15px]`.
- Primary: `bg-c-amber hover:bg-c-amber-bright text-c-bg rounded-lg`
  (+ `shadow-lg shadow-c-amber/20` for hero CTAs).
- Secondary: `bg-c-bezel hover:bg-c-border text-c-text border border-c-border`.
- Label sentence-case: "Start free trial", "Sign in", "Manage subscription".

## Surfaces & motion

- Cards: `bezel rounded-xl border border-c-border` with generous padding.
  The active/armed surface uses `.station` + `ring-1 ring-c-amber/20`.
  Recessed wells use `.iframe`.
- **No decorative continuous animation** on static content (remove `ipulse`,
  global `flicker`). Glow only on hero H1, CTAs, and live status.
- Focus ring is global (`:focus-visible` 2px amber) — don't fight it.
- Interactive pills/badges/icon-buttons: **44px min touch target**
  (`min-h-11`, adequate padding).

## Chrome (already shipped, reuse verbatim)

- Brand: `import { Logo } from '@/components/Brand'` → `<Logo size="md" href="/" glow />`
  in nav; `<Logo size="sm" />` in footers. `BrandMark` is the standalone mark.
- Nav links sentence-case, `text-c-muted hover:text-c-text`, amber CTA button.
- `Footer` already fixed (sentence-case 12px disclaimer) — just render it.

## Per-screen done = 

Reads premium and calm; one clear hierarchy; cockpit identity carried by the
mark + micro-labels + accents, not by shouting every label; no 10px text; all
CTAs/links sentence-case; `npm run typecheck` green.
