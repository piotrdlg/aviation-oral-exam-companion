# HeyDPE Mobile — iOS + Android Implementation Plan

> The complete, store-acceptance-grade plan for the native iOS (first) and Android (follows)
> incarnations of HeyDPE. **Definition of done = accepted into the App Store** (then Google Play).
> Every document pairs **qualitative requirements** with **measurable, pass/fail success criteria**,
> and every backend claim is cited to `file:line` in the web repo. Authored 2026-06-15.

Start at **[`00-MOBILE-MASTER-PLAN.md`](./00-MOBILE-MASTER-PLAN.md)** — it carries the vision, the
monorepo architecture, the milestone sequencing logic, the dependency graph, and the go/no-go gate.
The documents below are its chapters.

---

## Locked decisions (the foundation; do not re-litigate)

| # | Decision | Rationale |
|---|----------|-----------|
| D5 | **React Native + Expo** (dev-client, New Architecture) | ~3,000 lines of TS contract logic reuse for a solo maintainer; Supabase + Deepgram WS are first-class on RN |
| — | **Monorepo (Turborepo)**: `apps/mobile` + `packages/shared` in this repo | `sentence-boundary.ts`, `types/database.ts`, tier mapping become one source of truth for web + mobile |
| — | **Native-adapted FLIGHT DECK** design | Keep the cockpit brand (tokens, attitude-indicator mark, `//` micro-labels, mono readouts) **and** honor iOS HIG / Material 3 |
| — | **Parity v1**, delight as **v1.1** | Mirror the web's 7 core screens to App-Store quality fast; Live Activities / widgets / Siri / Watch are specified but deferred |
| — | **iOS first, Android follows** on the shared core | iOS is the immediate goal; Android reuses the same `packages/shared` + API contract |
| — | **RevenueCat**; IAP-primary on iOS; Stripe + IAP **never stack** | Apple 3.1.1; server entitlement merge keyed on the Supabase user id |

---

## Reading order / document map

| Doc | Purpose |
|-----|---------|
| [`00-MOBILE-MASTER-PLAN.md`](./00-MOBILE-MASTER-PLAN.md) | **Entry point.** Vision, monorepo architecture, milestone sequencing (M0→M7), dependency graph, critical path, risk register, go/no-go gate |
| [`01-API-ENABLEMENT-AND-CONTRACT.md`](./01-API-ENABLEMENT-AND-CONTRACT.md) | Part A: backend bearer-auth enablement (task M1) with `file:line` change points + tests. Part B: the exhaustive v1 mobile API contract (every route, request/response, SSE format, `X-Task-*` headers, 429/error shapes) |
| [`02-DESIGN-SYSTEM.md`](./02-DESIGN-SYSTEM.md) | Native-adapted FLIGHT DECK: tokens, typography, component library → RN, navigation (expo-router), motion/haptics, accessibility baseline |
| [`03-VOICE-PIPELINE.md`](./03-VOICE-PIPELINE.md) | Native mic PCM → Deepgram WS, TTS mp3 → expo-audio, sentence-boundary port, barge-in, echo cancellation, background audio, interruptions; the T1–T6 thresholds |
| [`04-PAYMENTS-ENTITLEMENTS.md`](./04-PAYMENTS-ENTITLEMENTS.md) | RevenueCat client + the M4 server: `/api/iap/webhook`, `entitlement_source` migration, precedence (no stacking), `/api/iap/eligibility`, full test matrix |
| [`05-APPLE-COMPLIANCE.md`](./05-APPLE-COMPLIANCE.md) | 25-section App Store Review checklist mapped to HeyDPE, each with a measurable verification + submission runbook + go/no-go |
| [`06-GOOGLE-PLAY-COMPLIANCE.md`](./06-GOOGLE-PLAY-COMPLIANCE.md) | Exhaustive Play checklist: Data Safety, billing, account deletion, target API, foreground-service media, runbook |
| [`07-TELEMETRY.md`](./07-TELEMETRY.md) | PostHog RN + Sentry RN, consent gating, the event-parity table; **a cross-cutting M2–M6 workstream**, not a standalone milestone |
| [`08-VOICE-SPIKE-M3.md`](./08-VOICE-SPIKE-M3.md) | The binding go/no-go voice spike that de-risks RN audio before the production build (Flutter contingency) |
| [`09-DELIGHT-V1.1.md`](./09-DELIGHT-V1.1.md) | v1.1 fast-follow (fully specified, **not in v1**): Live Activities/Dynamic Island, widgets, Siri Shortcuts, optional Watch |
| [`screens/01-auth.md`](./screens/01-auth.md) … [`screens/07-paywall.md`](./screens/07-paywall.md) | The 7 v1 screen specs: auth, onboarding, **practice (core)**, home, progress, settings, paywall |

---

## Milestone sequence (iOS first → Android)

```
M0 scaffold + auth ──▶ M1 backend enablement ──▶ M2 text-only exam loop ──┐
   (monorepo, Expo,        (bearer auth,            (SSE/state contract      │
    SIWA, SecureStore)      packages/shared)         de-risked, voice OFF)   │
                                                                            ▼
                            M3 voice spike ⊣GATE⊣ ──▶ voice pipeline ──▶ M4 payments
                            (08; GO/NO-GO on            (lights up only      (RevenueCat
                             real hardware)              after GO)            + IAP merge)
                                                                            │
                                       M5 progress/settings/polish ◀────────┘
                                                  │
                                                  ▼
                                  M6 ═══ iOS STORE ACCEPTANCE (= DoD) ═══
                                                  │
                                                  ▼
                                  M7 Android parity + Google Play submission

Cross-cutting (M2 → M6): telemetry (07), accessibility, the privacy-policy correction.
```

The **why** of this order: M1 unblocks ~90% of routes with one auth change; M2 proves the SSE/state
contract with zero audio risk; M3 is a throwaway spike that must pass on physical devices **before**
any production voice code exists; payments land after the loop works; iOS reaches the store before
Android work begins. Full analysis in `00-MOBILE-MASTER-PLAN.md §4`.

---

## ⛔ Blocking prerequisites (owner action required before submission)

1. **Privacy policy is stale and store-blocking.** `src/app/privacy/page.tsx` still describes the
   browser Web Speech API → Google + OpenAI TTS and lists web-only trackers (GA4 / Google Ads /
   Clarity), and claims audio is processed client-side. The shipping stack is **Deepgram Nova-3 STT +
   Aura-2 TTS**, and the native app streams **raw PCM off-device**. The App Privacy Nutrition Label
   (Apple) and Data Safety form (Google) must match the policy, so this must be corrected first.
   *(Flagged in `05-APPLE §10` and `06-GOOGLE §1`; not auto-edited — it is legal copy.)*
2. **Terms refund clause (legal).** Terms §5 promises a developer-issued 7-day email refund. For IAP,
   Apple/Google issue refunds. Add a store-conditional clause; reserve the email-refund promise to
   web/Stripe. *(`04-PAYMENTS §3.6`, `05-APPLE §4`.)*

---

## Top owner-decisions (each has a recommended default in-doc)

| Decision | Recommendation | Where |
|----------|----------------|-------|
| Relocate web into `apps/web/` now or defer | **Now**, in one no-behavior-change PR during M0 | `00 §D-MM-1` |
| Shared package name | `@heydpe/shared` | `00 §D-MM-2`, `01` |
| iPad in v1 | **iPhone-only v1** (defer iPad layouts/screenshots) | `00 §D-MM-3`, `screens/04,07` |
| US external-purchase link on iOS | **IAP-only v1** (zero anti-steering risk; revisit post-SCOTUS) | `05`, `07-paywall` |
| Android billing | Google Play Billing via RevenueCat (decide at M7) | `04`, `06` |
| App Review demo account | A `paid_equivalent` "Tester" override that never bills/expires | `05 §1` |
| Apple price tiers vs Stripe ($39/mo, $299/yr) | Pick nearest Apple tiers; keep on-screen prices consistent | `04 §1`, `07-paywall` |
| Push notifications in v1 | **No push in v1** (defer the settings deep-link to v1.1) | `06` |
| Custom avatar upload | **Default avatars only in v1** (keeps "mic is the only permission" true) | `05 §10`, `screens/06` |
| Account deletion vs live store sub | Allow deletion + detach RevenueCat + warn store sub keeps billing | `04 §3.5`, `screens/06 D-SET-2`, `06` |

Inline `OWNER DECISION` callouts in each document capture the finer-grained choices.

---

## Provenance

This corpus was authored by a multi-agent workflow that (1) grounded every technical claim in the
web codebase, (2) verified store policy against live Apple/Google/Expo/RevenueCat sources as of
2026-06, and (3) was reviewed by four adversarial critics (Apple-rejection, Play-rejection,
technical-buildability, sequencing-coherence) whose findings were remediated. Policy claims marked
`VERIFY-AT-SUBMISSION` must be re-checked at submit time — store rules change.
