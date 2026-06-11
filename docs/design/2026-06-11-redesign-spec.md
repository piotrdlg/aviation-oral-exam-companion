# HeyDPE Redesign Spec — "FLIGHT DECK"

> Phase 6B · W6B.2 · 2026-06-11 · **A proposal for owner review — nothing in the live app has been changed.**
> Companion: `2026-06-11-ui-ux-audit.md` (71 findings). Mockups: `mockups/live-exam.html`, `mockups/progress.html`.
> Method: three independent redesign directions were generated and scored by a usability / brand / awards panel. **FLIGHT DECK won unanimously (35.2 / 40)** over "Sectional & Slate" (32.0) and "Briefing Room" (29.3), with the strongest ideas from the runners-up grafted in.

---

## 1. The direction in one paragraph

HeyDPE should feel like sitting down in front of a **certified glass cockpit** — a Garmin G1000 or a modern EFB — **not a hacker terminal**. The soul stays: deep navy-black, amber command, cyan data. What changes is discipline and one signature. We keep 100% of the brand equity (amber / cyan / navy / the bezel metaphor) and evolve the existing design tokens — this is the **lowest-brand-risk** path that still clears the award bar, because juries reward *a strong, coherent point of view executed with restraint* over a louder one. The avionics vocabulary isn't decoration: it's the exact metaphor a pilot already trusts, so the design language itself says "checkride-grade."

**Why this audience:** pilots study on laptops in bright FBO lounges, are often older (contrast-sensitive), and are paying $39–299/mo to *trust the grading*. Every current credibility-killer is a betrayal of that trust — the empty exam void reads as "crashed," the progress zeros read as "lost my work," the buried FAA citations hide the one feature that proves the AI is grounded in the ACS. FLIGHT DECK fixes each with an instrument the pilot already trusts.

---

## 2. The five signature moves

1. **The Examiner Annunciator** — a single G1000-style mode annunciator fused into the mic console, always in one of three states: **amber pulsing "EXAMINER SPEAKING" / cyan live-waveform "LISTENING" / steady green "READY — YOUR TURN."** It solves the hidden voice-state problem *and* becomes the screenshot-worthy hero of the product. A "tap to answer" label makes the currently-undiscoverable barge-in obvious.
2. **The Transcript Strip** — kill the void by construction: the chat becomes a centered ~66ch column, **bottom-anchored** (`justify-end` / column-reverse) so the latest exchange always sits just above the console. Older turns scroll up under a sticky frosted ACS-task header. *(grafted from "Briefing Room.")*
3. **Cause→Effect Exchange Card** — each Q&A reads as one connected instrument readout: examiner question → applicant answer → a **SATISFACTORY / PARTIAL / UNSAT annunciator badge at the card edge** → an **open-by-default "FAA References" chip row**. The flagship trust feature stops hiding in a collapsed accordion. *(grade-gutter idea grafted from "Briefing Room.")*
4. **The Readiness HSI** — the Progress hero stat becomes a real circular gauge (HSI / attitude-indicator styled) that fills as ACS areas are covered, with an **honest empty state**: instead of a hollow "0," the needle parks low with "COMPLETE AN EXAM TO CALIBRATE." Never reads as data loss again.
5. **Annunciator status language** — replace the stranded debug "red 1 Issue" pill with a real CAS-style strip docked to the console ("ANSWER LOGGED — SCORING" / "REFERENCE IMAGERY UNAVAILABLE" / "ALL SYSTEMS NOMINAL"), 44px min target. Errors look intentional and diagnostic, not leftover.

**Grafted options (panel-recommended):** a **light theme** toggle in the header (from "Sectional & Slate") shipped as an option, not the default; the calmer Slate contrast palette applied under the cockpit look.

---

## 3. Design tokens (proposed)

All within the existing stack — **IBM Plex Sans + JetBrains Mono are already loaded; no new font cost.**

### Palette — keep the soul, lift the readable layers
| Token | Current | Proposed | Role |
|---|---|---|---|
| `--c-bg` | `#080c12` | `#080C12` (unchanged) | ground |
| `--c-panel` | `#0d1117` | `#0D1117` | surface |
| `--c-bezel` | `#161b22` | `#161B22` | raised glass |
| `--c-elevated-2` | — | **`#1E2530` (new)** | the active examiner station ("lit glass") |
| `--c-border` | `#1c2333` | **`#283142`** | visible 1px hairlines |
| `--c-border-hi` | `#2a3040` | **`#3A4456`** | |
| `--c-amber` | `#f5a623` | `#F5A623` | command / CTA / headline only |
| `--c-amber-bright` | — | **`#FFB94A`** | hover / active annunciator |
| `--c-cyan` | `#00d4ff` | `#00D4FF` (data) | accent |
| `--c-cyan-readable` | — | **`#4FD8FF`** | any cyan **text** (clears 4.5:1) |
| `--c-green` | `#00ff41` | **`#19E66B`** | avionics green (retire the harsh neon) |
| `--c-green-readable` | — | **`#4BE88E`** | "satisfactory" text |
| `--c-danger` | `#ff3b30` | **`#FF5A4D`** | AA-on-dark |
| `--c-text` | `#c9d1d9` | **`#D7DEE6`** | reading text |
| `--c-muted` | `#8b949e` | **`#AAB4C0`** (~0.72 white) | **single biggest WCAG fix** |
| `--c-dim` | `#565e68` | **`#9AA4B2`** floor — never below | |

### Typography — a three-role system (the core discipline)
- **Role 1 · INSTRUMENT** (JetBrains Mono, uppercase, tracking-wide, glow-allowed): page H1, bezel micro-labels (`READINESS`, `Q&A`, `VOICE`), status annunciators, ACS task codes (`PA.I.B`). **12px floor — kill every 10px.**
- **Role 2 · READING** (IBM Plex Sans, **sentence case, no glow, leading ~1.6, measure capped ~62–66ch**): examiner questions, applicant answers, assessment feedback, FAA reference text, feature-card descriptions, section subheads, the legal disclaimer (10px→13px).
- **Role 3 · NUMERIC** (Plex tabular-nums / JetBrains Mono for gauges): the big stat values (0 / 2 / 28) so digits align like an instrument readout.
- **The shippable rule:** *if a string is longer than ~5 words OR is prose a user reads to comprehend, it is Plex sentence-case — never caps-mono.* Scale: H1 28/32, H2 20, section-label 12 caps, body 15–16, micro-label 12, gauge value 26 tabular.

### Depth, radii, motion
- One shared shadow recipe so the "instrument cluster" metaphor holds (current bug: `.bezel` and `.iframe` diverge). `--shadow-instrument: inset 0 1px 0 rgba(255,255,255,.04), inset 0 0 12px rgba(0,0,0,.45), 0 4px 20px rgba(0,0,0,.5)`. Bezel = recipe + 135° gradient (raised); iframe = recipe minus outer drop (recessed); **active examiner station = recipe + `ring-1 ring-c-amber/20`** (the one "powered, in-focus" gauge).
- Radii: panels 12 · buttons/inputs 8 · pills/annunciators 6 · gauge rings full.
- Focus: `ring-1 → ring-2` + 2px offset, amber on dark / cyan on amber, **never glow-only**.
- Motion: calm, instrument-grade, `prefers-reduced-motion`-safe. Annunciator cross-fades 180ms with a single soft 1.6s pulse (cockpit annunciators pulse, they don't strobe). **Scanline committed at 0.03–0.035** on exam glass + headers only (currently 0.012 = invisibly half-finished). **Kill the global 4s CRT flicker** (reads "broken" on a paid tool); keep one optional 6s flicker only on the landing hero as deliberate theater.

---

## 4. Per-screen changes — prioritized

### P0 — credibility blockers (do first; mockups attached)

**Live exam — the make-or-break** (`src/app/(dashboard)/practice/page.tsx`):
1. **Root-cause void fix (~line 2092):** change the chat container from top-aligned `flex-1 overflow-y-auto space-y-4` to **bottom-anchored** `flex-1 flex flex-col justify-end overflow-y-auto`, inner `flex flex-col gap-4`, messages in a centered `max-w-[68ch] mx-auto`. A single examiner message now renders directly above the console.
2. **Bubble measure (~line 2112):** `max-w-[calc(100%-4.5rem)]` → `max-w-[60ch]` so long ACS questions stop reflowing to one word per line.
3. **Sticky ACS header (~line 1952):** `sticky top-0 z-20` inside the scroll container, frosted `bg-c-bg/85 backdrop-blur border-b`.
4. **The console:** unify mic + the tri-state Examiner Annunciator + textarea + send on `--c-elevated-2` with the amber-rim instrument shadow; fold the split-off top-right VOICE status into it.
5. **Assessment:** pull the satisfactory/partial/unsat badge out of mid-bubble to a card-edge annunciator; set FAA References **open by default** as a cyan chip row.
6. Replace the "red 1 Issue" pill with the docked annunciator strip.
> *Risk control:* this page has paying users — edits 1–3 and 5–6 are surgical/low-risk; the **new unified console + annunciator is the one genuinely new component → ship behind a flag with the current input bar as fallback.**

**Progress — the calibrated panel** (`src/app/(dashboard)/progress/page.tsx`):
- **Diagnose the "0 readiness / 0% coverage next to 2 exams / 28 exchanges" first** — rating-filter/aggregation bug vs render-before-load. Add **skeleton loaders** so hollow zeros never render mid-fetch. *(The redesign is blocked on this data fix — the HSI gauge will faithfully render a wrong number otherwise.)*
- Readiness → the **Readiness HSI gauge**; genuine no-data state parks the needle low with "Complete an exam to calibrate your readiness," not a bare 0.
- Big numbers (2, 28, 0%) → role-3 tabular-nums. Empty WEAK AREAS / STUDY PLAN → next-step CTAs.

**Global cookie bar:** float it **above** the footer (or reserve footer padding while visible) so Privacy / Terms / Accessibility stay clickable — pure CSS, fixes a confirmed legal + a11y + "unfinished" signal across every page.

### P1 — system sweep (high impact, broad surface)
- **Typography migration:** the caps→sentence-case sweep across body copy / feature cards / settings labels / examiner+answer text. *Largest surface area — must be one disciplined sweep, not piecemeal, or it leaves an inconsistent half-state.*
- **Contrast/focus tokens:** ship the palette table above (the `--c-muted` lift + 12px floor + `ring-2`) — clears the bulk of the WCAG cluster at the token level.
- **Glow discipline:** restrict glow to CTAs + top-level headings + status; commit the scanline; kill the global flicker.
- **Landing:** body + feature-card copy to role-2; de-glow the dense lower sections; add an honest trust line near the hero ("AI examiner grounded in the FAA ACS — a practice tool, not a substitute for your CFI or a real DPE") to cut over-promise/refund risk.

### P2 — polish
- Distinctive logo mark (amber+cyan geometry — attitude indicator / yoke / monogram, legible at 16px).
- Session-config: armed-card amber rim + one plain-language Study-Mode explainer.
- Settings: group into stacked "instrument" panels; command vs destructive button styling.
- Discard/Resume: add a one-line session preview ("Discard Preflight Preparation exam (1 Q&A)?").
- 44px touch targets on all badges/pills; unify shadow recipe.

---

## 5. Implementation note (W6B.3 — gated on your approval)

When approved, the recommended order is: **(1)** the P0 cookie-bar + exam void/header/measure fixes + the progress data diagnosis (all low-risk, immediate credibility) → **(2)** the token sweep (palette + type roles) as one PR → **(3)** the new annunciator console behind a flag → **(4)** P2 polish. Each as its own CI-green PR, paying users never broken. **Taste is yours** — this spec is the proposal, not a decision.
