# Review 12 — Voice Economics Decision D2: ElevenLabs Flash v2.5 vs Deepgram Aura-2

> Date: 2026-06-09 · Type: financial decision analysis (economics only)
> Decision: which TTS provider serves the paid tier (`dpe_live`)?
> Inputs: review 04 (cost model + market check), `src/lib/voice/types.ts` (quota caps), review 03 (LLM token estimate), June 2026 vendor pricing (web-verified, URLs cited)
> Companion decision context: D1 (owner decision) — free-trial users get FULL VOICE, so trial voice cost is a customer-acquisition cost (CAC), not COGS.

---

## 0. Fixed model parameters (from repo / review 04)

| Parameter | Value | Source |
|---|---|---|
| Avg TTS chars per examiner turn | **550** | review 04 cost model (`exam-logic.ts:231` word caps) |
| STT mic-open per answer | **40 s = 0.667 min** | review 04 |
| Per 30-exchange session | 16,500 TTS chars · 20 STT min | review 04 (sanity check: 550 × 30 = 16,500 ✓; 0.667 × 30 = 20 ✓) |
| Pricing | **$39/mo** monthly · **$299/yr = $24.92/mo** effective annual | pricing page / review 05 |
| `dpe_live` caps | unlimited sessions · **50 exchanges/session** · **1,000,000 TTS chars/mo** | `src/lib/voice/types.ts:76-84` (verified) |
| Free/lower tiers caps | 60 sessions/mo · 30 exchanges/session · 500K chars/mo | `types.ts:58-75` |
| STT quota | **none exists** (review 04 finding 10 — STT ungated) | `usage.ts`, `stt/token/route.ts` |
| Char quota enforcement | **currently broken** — counts rows, not chars (finding 2); analysis below assumes the post-W3.2 fix is in place | `tts/route.ts:72-78` |

**Per-exchange voice units:** 550 TTS chars + 0.667 STT min.

---

## Part 1 — Verified pricing (June 2026)

### 1.1 Deepgram (incumbent)

| Item | Pay-as-you-go | Growth plan | Notes |
|---|---|---|---|
| **Aura-2 TTS** | **$0.030 / 1K chars** | **$0.027 / 1K** (−10%) | Confirmed current as of April 2026. No tiered voice pricing — all 40+ voices same rate. |
| **Nova-3 STT (streaming, monolingual)** | $0.0048/min (current page) | $0.0042/min | Review 04 modeled **$0.0077/min**; the current pricing page shows $0.0048/min for Nova-3 monolingual streaming. This analysis keeps **$0.0077/min** (conservative, consistent with review 04); if the lower rate applies, STT figures shrink ~38% — it does not change the D2 decision since STT stays on Deepgram under every option. |
| Minimum commitment | none | **$4,000+ prepaid annual credits** | Growth = prepay, not a contract trap, but it is cash up front. |
| Concurrency (TTS REST+WSS) | **45** | **60** | Comfortable for sentence-chunked TTS at any plausible scale. |

Sources: https://deepgram.com/pricing · https://costbench.com/software/ai-transcription-apis/deepgram/ · https://deepgram.com/learn/introducing-aura-2-enterprise-text-to-speech · https://pricingsaas.com/news/deepgram/20251118/

### 1.2 ElevenLabs Flash v2.5 (challenger)

ElevenLabs prices via **subscription tiers with included credits**. Flash/Turbo models consume **0.5 credits per character** (Multilingual v2 = 1 credit/char), so each plan's Flash character allowance is 2× its credit count. The headline "Flash $0.05/1K chars" on the pricing page is the **usage-based / enterprise rate card** — a startup on a subscription tier pays a *higher effective* rate (subscription ÷ included Flash chars) plus tier-specific overage.

| Plan | $/mo | Credits | Flash chars included (2× credits) | **Effective $/1K Flash (fully used)** | Flash overage $/1K | Concurrency |
|---|---|---|---|---|---|---|
| Creator | $22 | 100K | 200K | **$0.110** | ~$0.15 | 5 |
| Pro | $99 | 500K | 1M | **$0.099** | ~$0.12 | 10 |
| Scale | $330 | 2M | 4M | **$0.0825** | ~$0.09 | 15 |
| Business | $1,320 | 11M | 22M | **$0.060** | ~$0.06 | 15 |
| Enterprise / usage-based | custom | — | — | **~$0.05** (headline rate card) | negotiated | negotiated |

Notes:
- Effective rates assume you consume the full allowance; under-consumption raises the effective rate (e.g., 8.9M chars on a Business plan = $1,320 ÷ 8.9M = **$0.148/1K**). This "tier-granularity tax" matters at small scale — modeled in Part 3.
- Annual billing ≈ 17% discount (2 months free) on plan fees; not applied below (conservative, and Deepgram figures are also undiscounted).
- The current elevenlabs.io pricing page shows slightly different plan framing (e.g., Scale listed at $299 with 1.98M Flash chars in one capture vs $330/2M credits in third-party trackers) — itself evidence of pricing churn; see Part 4.3. This analysis uses the consensus figures above; the conclusions are insensitive to ±10% on the plan fee.
- **Concurrency is a hidden tier-forcer**: Scale/Business cap at 15 concurrent requests. HeyDPE's sentence-chunked pipeline fires ~3 TTS requests per examiner turn; with even ~30–50 simultaneously active sessions, peak concurrency exceeds 15 and forces Business/enterprise *before* character volume does. Deepgram allows 45–60.

Sources: https://elevenlabs.io/pricing/api · https://www.cekura.ai/blogs/elevenlabs-pricing · https://flexprice.io/blog/elevenlabs-pricing-breakdown · https://bigvu.tv/blog/elevenlabs-pricing-2026-plans-credits-commercial-rights-api-costs · https://texttolab.com/blog/elevenlabs-pricing

### 1.3 Per-exchange unit costs (550 chars TTS + 0.667 min STT)

STT (identical under all options): 0.667 × $0.0077 = **$0.00513/exchange**.

| TTS option | TTS $/exchange (550 × rate ÷ 1000) | Total voice $/exchange |
|---|---|---|
| Aura-2 PAYG ($0.030) | $0.01650 | **$0.02163** |
| Aura-2 Growth ($0.027) | $0.01485 | **$0.01998** |
| EL Flash @ Pro eff. ($0.099) | $0.05445 | **$0.05958** |
| EL Flash @ Scale eff. ($0.0825) | $0.04538 | **$0.05050** |
| EL Flash @ Business eff./marginal ($0.060) | $0.03300 | **$0.03813** |
| EL Flash @ enterprise ($0.050) | $0.02750 | **$0.03263** |

**ElevenLabs is 2.0×–3.3× the Aura-2 rate on TTS at realistic startup volume** (Business effective $0.060 → enterprise $0.050 vs $0.030 → $0.027). The "$0.05 vs $0.03 = +67%" framing only holds at enterprise volume; at Pro/Scale the real premium is +175%–230%.

---

## Part 2 — Usage scenarios (per user per month)

Exchanges = sessions × exchanges/session. TTS chars = exchanges × 550. STT min = exchanges × 0.667.

| Archetype | Sessions × exch | Exchanges/mo | TTS chars/mo | STT min/mo | STT cost (× $0.0077) |
|---|---|---|---|---|---|
| **Light** | 4 × 20 | 80 | 44,000 | 53.3 | $0.41 |
| **Median** | 10 × 30 | 300 | 165,000 | 200.0 | $1.54 |
| **Heavy** | 30 × 40 | 1,200 | 660,000 | 800.0 | $6.16 |
| **Whale (cap-bound)** | ≈36.4 × 50 | 1,818 (= 1,000,000 ÷ 550) | 1,000,000 (cap) | 1,212 | $9.33 |
| **Trial (free, CAC)** | 3 × 20 | 60 | 33,000 | 40.0 | $0.31 |

Whale derivation: cap 1,000,000 chars ÷ 550 chars/exchange = 1,818.2 exchanges ≈ 36.4 sessions at the 50-exchange cap. **STT is uncapped** (finding 10), so whale STT cost is a floor, not a ceiling.

### 2.1 Monthly voice cost per archetype

TTS cost = chars × rate ÷ 1000; total = TTS + STT.

**(a) All-Aura-2 (status quo), PAYG $0.030/1K:**

| Archetype | TTS | STT | **Total** | (Growth $0.027 total) |
|---|---|---|---|---|
| Light | 44.0K × 0.030 = $1.32 | $0.41 | **$1.73** | $1.60 |
| Median | 165K × 0.030 = $4.95 | $1.54 | **$6.49** | $6.00 |
| Heavy | 660K × 0.030 = $19.80 | $6.16 | **$25.96** | $23.98 |
| Whale | 1,000K × 0.030 = $30.00 | $9.33 | **$39.33** | $36.33 |
| Trial | 33.0K × 0.030 = $0.99 | $0.31 | **$1.30** | $1.20 |

**(b) `dpe_live` on ElevenLabs Flash** — shown at the two realistic operating points: **Scale-effective $0.0825/1K** (≈50-user fleet) and **Business-effective/marginal $0.060/1K** (≈200+ users):

| Archetype | EL TTS @ $0.0825 | **Total @ Scale** | EL TTS @ $0.060 | **Total @ Business** |
|---|---|---|---|---|
| Light | 44.0K × 0.0825 = $3.63 | **$4.04** | $2.64 | **$3.05** |
| Median | 165K × 0.0825 = $13.61 | **$15.15** | $9.90 | **$11.44** |
| Heavy | 660K × 0.0825 = $54.45 | **$60.61** | $39.60 | **$45.76** |
| Whale | 1,000K × 0.0825 = $82.50 | **$91.83** | $60.00 | **$69.33** |

**(b-i) Sub-variant: trials stay on Aura-2** → trial = **$1.30** (table a). This is the natural hybrid: `TIER_FEATURES.ttsProvider` already supports per-tier providers, so `ground_school`/trial stays `'deepgram'` while `dpe_live` becomes `'elevenlabs'` — a config change plus one adapter.

**(b-ii) Sub-variant: trials also on ElevenLabs** → trial = 33.0K × 0.0825 + 0.31 = **$3.03** (Scale) or 33.0K × 0.060 + 0.31 = **$2.29** (Business marginal). This is the "trial experience identical to paid" purist version of D1.

---

## Part 3 — Portfolio economics

User mix assumption: **60% light / 30% median / 9% heavy / 1% whale**.

### 3.1 Blended consumption per paying user

- Blended TTS chars = 0.60×44,000 + 0.30×165,000 + 0.09×660,000 + 0.01×1,000,000
  = 26,400 + 49,500 + 59,400 + 10,000 = **145,300 chars/user/mo**
- Blended STT min = 0.60×53.3 + 0.30×200 + 0.09×800 + 0.01×1,212
  = 32.0 + 60.0 + 72.0 + 12.1 = **176.1 min/user/mo** → × $0.0077 = **$1.36**

### 3.2 Blended voice COGS per paying user (excl. trials)

| Option | TTS (145.3K × rate) | STT | **Blended voice COGS** | % of $39 | % of $24.92 |
|---|---|---|---|---|---|
| Aura-2 PAYG | $4.36 | $1.36 | **$5.72** | **14.7%** | **22.9%** |
| Aura-2 Growth | $3.92 | $1.36 | **$5.28** | 13.5% | 21.2% |
| EL @ Pro eff. $0.099 | $14.38 | $1.36 | **$15.74** | 40.4% | 63.2% |
| EL @ Scale eff. $0.0825 | $11.99 | $1.36 | **$13.34** | **34.2%** | **53.5%** |
| EL @ Business $0.060 | $8.72 | $1.36 | **$10.07** | **25.8%** | **40.4%** |
| EL @ enterprise $0.050 | $7.27 | $1.36 | **$8.63** | 22.1% | 34.6% |

**Headline:** moving `dpe_live` to ElevenLabs adds **$4.35–$7.62 per paying user per month** of voice COGS at realistic tiers — voice goes from ~15% of monthly-plan revenue to ~26–34%, and from ~23% to ~40–54% of annual-plan revenue.

### 3.3 Gross margin per archetype

**Voice-only gross margin (revenue − voice cost), $39 monthly plan:**

| Archetype | Aura-2 | margin % | EL @ $0.0825 | margin % | EL @ $0.060 | margin % |
|---|---|---|---|---|---|---|
| Light | 39 − 1.73 = **$37.27** | 95.6% | 39 − 4.04 = $34.96 | 89.6% | $35.95 | 92.2% |
| Median | 39 − 6.49 = **$32.51** | 83.4% | 39 − 15.15 = $23.85 | 61.2% | $27.56 | 70.7% |
| Heavy | 39 − 25.96 = **$13.04** | 33.4% | 39 − 60.61 = **−$21.61** | −55.4% | **−$6.76** | −17.3% |
| Whale | 39 − 39.33 = **−$0.33** | −0.8% | 39 − 91.83 = **−$52.83** | −135% | **−$30.33** | −77.8% |

At the **$24.92 annual effective price**: heavy is already marginal on Aura-2 (24.92 − 25.96 = **−$1.04**) and deeply negative on EL (−$35.69 @ Scale; −$20.84 @ Business). The whale loses $14.41/mo even on Aura-2.

**Key structural fact:** on Aura-2, the 1M-char cap pins worst-case voice cost (≈$39.33) at almost exactly the monthly price — the cap was evidently sized for Aura-2 economics. On ElevenLabs the same cap allows **$69–$92** of cost, i.e., 1.8–2.4× monthly revenue. Adopting EL without cutting the cap (to ~400–450K chars) bakes in loss-making power users.

**Voice + LLM gross margin (total-COGS framing).** Review 03: ~10–14K input tokens/exchange across the two Claude calls (retrieval context alone), before history/system prompt. At claude-sonnet-4-6 pricing ($3/M input, $15/M output): ≈12K input × $3/M = $0.036 + ≈800 output tokens × $15/M = $0.012 → **≈$0.05–0.07/exchange LLM, point estimate $0.06** (uncached). LLM is identical under both TTS options — excluded from D2 — but it dominates:

| Archetype | LLM est. (exch × $0.06) | $39 margin, Aura-2 + LLM | $39 margin, EL@Scale + LLM |
|---|---|---|---|
| Light | $4.80 | 39 − 1.73 − 4.80 = **$32.47** | $29.16 |
| Median | $18.00 | 39 − 6.49 − 18.00 = **$14.51** | $5.85 |
| Heavy | $72.00 | **−$58.96** | −$93.61 |
| Whale | ~$109 | **−$109.33** | −$161.83 |

Blended LLM ≈ 0.6×4.80 + 0.3×18.00 + 0.09×72.00 + 0.01×109 = **$15.85/user/mo** — ~2.8× the Aura-2 voice cost. Implication for D2: the TTS premium is the *controllable* COGS lever, and heavy users are unprofitable regardless of TTS vendor until prompt caching (review 03 action item) lands. That argues for the *cheaper* TTS option, not the premium one — there is no margin slack to spend on voice quality.

### 3.4 Trial CAC (D1: trials get full voice)

Voice cost per trial user → voice CAC per **converted** customer at conversion rate c (= trial cost ÷ c):

| Trial provider | $/trial | @ 5% conv. | @ 10% | @ 20% |
|---|---|---|---|---|
| Aura-2 | $1.30 | **$26.00** | **$13.00** | **$6.50** |
| EL @ Scale eff. | $3.03 | $60.60 | $30.30 | $15.15 |
| EL @ Business marg. | $2.29 | $45.80 | $22.90 | $11.45 |

Incremental EL-trial cost is $0.99–$1.73 per trial. For that to pay, the premium voice must lift trial→paid conversion by ≥ (incremental cost ÷ LTV margin): at ~$100 LTV gross margin (≈3–4 months × ~$30), the required uplift is only **≈1.0–1.7 percentage points** — small, but *unproven*. Conversely, on Aura-2 even a 5% conversion rate keeps voice CAC at $26 ≈ 0.8 months of blended gross profit — comfortably viable.

### 3.5 Break-even points (when does ElevenLabs usage cost cross key thresholds?)

EL premium over Aura-2 per exchange: 550 × (rate_EL − 0.030)/1000 = **$0.02888** @ Scale ($0.0825) / **$0.01650** @ Business ($0.060).

**(i) EL premium exceeds the monthly-vs-annual price difference ($39.00 − $24.92 = $14.08/mo):**
- @ Scale: 14.08 ÷ 0.02888 = **488 exchanges/mo ≈ 16 median sessions** — i.e., for any annual subscriber at ~1.6× median usage, the *extra* cost of EL alone eats the entire annual-plan discount cushion.
- @ Business: 14.08 ÷ 0.01650 = **853 exchanges/mo ≈ 28 median sessions**.

**(ii) EL total voice cost exceeds full subscription revenue:**

| Threshold | EL @ Scale ($0.05050/exch) | EL @ Business ($0.03813/exch) | Aura-2 ($0.02163/exch) |
|---|---|---|---|
| > $39.00 (monthly) | 39 ÷ 0.05050 = **772 exch ≈ 26 sessions×30** (or 15.4 sessions×50) | 1,023 exch ≈ 34 sessions×30 | 1,803 exch — only just under the 1,818-exchange quota cap |
| > $24.92 (annual) | 24.92 ÷ 0.05050 = **493 exch ≈ 16 sessions×30** | 654 exch ≈ 22 sessions×30 | 1,152 exch ≈ 38 sessions×30 |

Reading: on ElevenLabs, an **annual subscriber becomes loss-making on voice alone at ~16 median sessions/month** — well inside the "serious checkride-prep crunch month" usage band this product is built for. On Aura-2 the same point sits at ~38 sessions, beyond all but whale behavior, and the 1M cap backstops it.

### 3.6 Scale table — total monthly voice spend

Assumptions: 10% monthly net new paying users; **10 trials per net new paying user** ⇒ trials/mo = base × 0.10 × 10 = **equal to the paying base**. Paying user: 145,300 chars + 176.1 STT min; trial: 33,000 chars + 40 STT min.

Volume per scale point:

| Paying users | Paid chars | Trial chars | **Total chars** | Total STT min |
|---|---|---|---|---|
| 50 (+50 trials) | 7.265M | 1.65M | **8.915M** | 8,805 + 2,000 = 10,805 |
| 200 (+200 trials) | 29.06M | 6.60M | **35.66M** | 35,220 + 8,000 = 43,220 |
| 1,000 (+1,000 trials) | 145.3M | 33.0M | **178.3M** | 176,100 + 40,000 = 216,100 |

**Option A — all-Aura-2 (status quo):** TTS = chars × $0.030/1K; STT = min × $0.0077.

| Users | TTS | STT | **Total/mo** | per paying user | (Growth $0.027 total) |
|---|---|---|---|---|---|
| 50 | $267.45 | $83.20 | **$350.65** | $7.01 | $323.91 |
| 200 | $1,069.80 | $332.79 | **$1,402.59** | $7.01 | $1,295.61 |
| 1,000 | $5,349.00 | $1,663.97 | **$7,012.97** | $7.01 | $6,478.07 |

**Option B — all-ElevenLabs (paid + trials on EL), cheapest plan+overage mix at each scale:**

| Users | EL plan math | EL TTS | Eff. $/1K | + STT | **Total/mo** | per paying user |
|---|---|---|---|---|---|---|
| 50 | Scale $330 (4M) + 4.915M × $0.09 = $330 + $442.35 | **$772.35** | $0.0866 | $83.20 | **$855.55** | **$17.11** |
| 200 | Business $1,320 (22M) + 13.66M × $0.06 = $1,320 + $819.60 | **$2,139.60** | $0.0600 | $332.79 | **$2,472.39** | **$12.36** |
| 1,000 | Business $1,320 + 156.3M × $0.06 = $10,698 (or enterprise 178.3M × $0.05 = $8,915) | **$10,698** / $8,915 | $0.060 / $0.050 | $1,663.97 | **$12,362** / $10,579 | $12.36 / $10.58 |

Tier-jump flags: at 50 users you straddle Scale→Business (Business at $1,320 would cost *more* than Scale+overage — the 22M allowance is 2.5× your need, effective $0.148/1K if bought). At ~55+ users (>10M chars) Business becomes cheaper. At ~150+ users you exceed Business's 22M allowance and live permanently in overage; ~20M+ chars/mo is where an enterprise deal (~$0.05/1K) is negotiable. Concurrency (15 max below enterprise) likely forces the enterprise conversation even earlier — see §1.2.

**Option C — hybrid: ElevenLabs for `dpe_live` paid users only, Aura-2 for trials:**

| Users | EL paid TTS | Aura trial TTS | STT | **Total/mo** | per paying user |
|---|---|---|---|---|---|
| 50 | Scale $330 + 3.265M × $0.09 = **$623.85** | 1.65M × 0.030 = $49.50 | $83.20 | **$756.55** | **$15.13** |
| 200 | Business $1,320 + 7.06M × $0.06 = **$1,743.60** | 6.6M × 0.030 = $198.00 | $332.79 | **$2,274.39** | **$11.37** |
| 1,000 | Business $1,320 + 123.3M × $0.06 = **$8,718.00** (or ent. 145.3M × $0.05 = $7,265) | 33M × 0.030 = $990.00 | $1,663.97 | **$11,372** / $9,919 | $11.37 / $9.92 |

**Delta summary (Option vs status quo A):**

| Users | A (Aura) | C (hybrid) | B (all-EL) | C premium | B premium |
|---|---|---|---|---|---|
| 50 | $350.65 | $756.55 | $855.55 | **+$405.90/mo (+116%)** | +$504.90 (+144%) |
| 200 | $1,402.59 | $2,274.39 | $2,472.39 | **+$871.80/mo (+62%)** | +$1,069.80 (+76%) |
| 1,000 | $7,013 | $11,372 | $12,362 | **+$4,359/mo (+62%)** | +$5,349 (+76%) |

Revenue context at 200 users (assume 50/50 monthly/annual → ARPU ≈ $31.96): MRR ≈ $6,392. Voice COGS: A = 21.9% of MRR; C = 35.6%; B = 38.7%.

---

## Part 4 — Risk & qualitative notes (economics-adjacent)

### 4.1 Quota design under each option (post-W3.2 cap fix)

- Worst-case **TTS** cost per `dpe_live` user at the 1M-char cap: **Aura-2 $30.00** (Growth $27.00) vs **EL $60.00–$82.50** (Business marginal → Scale effective). Aura-2's worst case ≈ 77% of monthly revenue; EL's worst case = **154–212%** of monthly revenue, and 241–331% of annual-effective revenue.
- If EL is adopted, the cap must drop to ≈ **400–450K chars/mo** (≈$24–$37 EL cost) to preserve the same worst-case exposure — a visible product downgrade ("unlimited" feels less unlimited) that is itself a cost of switching.
- **STT remains uncapped under both options** (finding 10). At $0.0077/min the whale's $9.33 STT is a floor with no ceiling. Fix this regardless of D2; it is the only truly unbounded number in this whole analysis.
- Reminder: none of the caps bind today because the quota check counts rows, not characters (finding 2). W3.2 is a prerequisite for *either* vendor's economics to hold.

### 4.2 ElevenLabs mobile SDK value (avoided dev cost)

Review 04 mobile implications: audio capture and playback must be rebuilt natively regardless of vendor; ElevenLabs ships **official Swift, Kotlin, and React Native SDKs**, while Deepgram/Cartesia are raw WebSocket/REST. The SDK covers the TTS streaming + native playback half (the part whose web equivalent caused the March 2026 incident chain); STT capture stays custom for Deepgram either way.

Rough estimate: hand-rolling streamed TTS playback (AVAudioPlayer/ExoPlayer, buffering, chunk sequencing, error/fallback handling) ≈ 1.5–2 weeks per platform → **3–4 engineering weeks saved across iOS+Android**, ≈ **$9K–$25K** at US contractor rates, or ~1 month of solo-founder calendar time. As an economics offset: at the 200-user hybrid premium of $872/mo, the SDK saving is consumed in **10–29 months** — a real but one-time credit against a permanent COGS increase. It tilts the math only if mobile launch is imminent *and* the apps would otherwise slip.

### 4.3 Price-change / lock-in risk

- **ElevenLabs:** credit-denominated pricing means the effective rate can change without a headline change (the Flash 0.5-credit/char multiplier, plan credit counts, and plan fees have all moved; the live pricing page already disagrees with month-old third-party trackers — Scale $299 vs $330, included volumes restated in chars vs credits). Subscription structure also creates soft lock-in: monthly plan fees are sunk whether or not volume materializes, and downgrade friction is real. Voice IDs are proprietary (the chosen DPE persona voice doesn't port out).
- **Deepgram:** flat metered PAYG, no commitment, and the recent direction has been pro-customer (Aura-2 concurrency doubled Nov 2025 at the same price; Nova-3 streaming now listed *below* the rate review 04 modeled). Growth requires $4K prepay but that's optional.
- Both risks are partially hedged by the existing provider-factory abstraction (`src/lib/voice/provider-factory.ts`) — but only once finding 3 (fallback never triggers on runtime API failures) is fixed; today a vendor outage or repricing-by-degradation has no automatic escape hatch.

---

## Part 5 — Recommendation

**Stay on Deepgram Aura-2 for all tiers, including `dpe_live` — do not adopt ElevenLabs Flash v2.5 now.** The decisive numbers: at realistic startup volume ElevenLabs' effective rate is **$0.060–$0.0825/1K vs Aura-2's $0.030/1K (2.0–2.75×)**, which moves blended voice COGS from **$5.72 to $10.07–$13.34 per paying user per month** (15% → 26–34% of $39 revenue; 23% → 40–54% of the $24.92 annual-effective price), flips the heavy archetype from **+$13.04 to −$6.76…−$21.61** gross margin, raises the cap-bound worst case from **$39.33 (≈break-even) to $69–$92 (1.8–2.4× revenue)**, and doubles trial CAC ($13.00 → $22.90–$30.30 per conversion at 10%). With LLM COGS already ≈$15.85/user/mo uncached (the real margin problem), there is no slack to spend on premium voice. The one-time mobile-SDK saving (~$9–25K) does not offset a permanent +$870/mo at 200 users (+$4,400/mo at 1,000). **ElevenLabs becomes the right choice if any of these flips:** (a) an A/B test shows the premium voice lifts trial→paid conversion by ≥2pp or materially cuts churn — at ~$100 LTV margin, even ~1.5pp uplift covers the trial-side delta, and ~25% churn reduction would cover the COGS delta; (b) an enterprise deal lands at ≤ **$0.040/1K** Flash (blended COGS $7.17 — within $1.45 of Aura-2, at which point quality and the mobile SDKs win); or (c) mobile launch is committed within ~2 quarters and voice quality is the chosen differentiator. **If a premium voice for `dpe_live` is wanted sooner, the only economically defensible shape is the hybrid (Option C): ElevenLabs for paid `dpe_live` only, Aura-2 for trials and any future lower tier**, with the `dpe_live` TTS cap reduced to ~450K chars/mo (worst case ≈$27 EL ≈ Aura-2's current worst case) — blended cost **$11.37/paying user/mo (29.2% of $39)** vs $12.36 all-EL and $7.01 status quo. Prerequisites for any path: ship the W3.2 char-quota fix (finding 2), add an STT minutes cap (finding 10), and make the provider fallback actually fire at runtime (finding 3).

---

## Sources

- Deepgram pricing: https://deepgram.com/pricing · https://costbench.com/software/ai-transcription-apis/deepgram/ · https://deepgram.com/learn/introducing-aura-2-enterprise-text-to-speech · https://pricingsaas.com/news/deepgram/20251118/
- ElevenLabs pricing: https://elevenlabs.io/pricing/api · https://www.cekura.ai/blogs/elevenlabs-pricing · https://flexprice.io/blog/elevenlabs-pricing-breakdown · https://bigvu.tv/blog/elevenlabs-pricing-2026-plans-credits-commercial-rights-api-costs · https://texttolab.com/blog/elevenlabs-pricing · https://smallest.ai/blog/elevenlabs-pricing-explained-plans-limits-hidden-costs-calculator
- ElevenLabs mobile SDKs: https://github.com/elevenlabs/elevenlabs-swift-sdk · https://elevenlabs.io/docs/eleven-agents/libraries/react-native
- Claude Sonnet 4.6 pricing ($3/M input, $15/M output): https://platform.claude.com/docs/en/pricing
- Repo inputs: `docs/reviews/2026-06-09-comprehensive-review/04-voice-stack.md` (cost model, findings 2/3/10, mobile implications) · `src/lib/voice/types.ts` (TIER_FEATURES caps) · `docs/reviews/2026-06-09-comprehensive-review/03-knowledge-graph-rag.md` (10–14K input tokens/exchange)
