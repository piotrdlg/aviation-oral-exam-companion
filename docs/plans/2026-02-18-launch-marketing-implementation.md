# HeyDPE Launch Marketing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build all technical infrastructure and prepare all assets needed to execute the HeyDPE Demo-Led Viral Launch within 2-4 weeks.

**Architecture:** The launch requires 6 technical tasks (new landing page, OG meta tags, UTM tracking, homepage CTA updates, sitemap/robots.txt, email integration placeholder) and 3 non-technical prep tasks (demo video, Google Ads account, CFI outreach list). All technical work is within the existing Next.js 16 + Tailwind v4 + Supabase stack. No new dependencies except one email service (Resend).

**Tech Stack:** Next.js 16.1.6, Tailwind CSS v4, TypeScript, Supabase, Vercel

**Design Doc:** `docs/plans/2026-02-18-launch-marketing-strategy-design.md`
**Full Strategy:** Obsidian → HeyDPE → Marketing/ (12 interlinked documents)

---

## Task 1: Add OG Meta Tags & Social Sharing Metadata

When the demo video / launch posts get shared on Reddit, Discord, and forums, the link preview must look professional. Currently no OG tags exist.

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/pricing/page.tsx`
- Create: `src/app/opengraph-image.png` (placeholder — replace with branded image before launch)

**Step 1: Update root layout metadata**

Add comprehensive OG and Twitter card metadata to `src/app/layout.tsx`:

```typescript
export const metadata: Metadata = {
  title: "HeyDPE — AI Checkride Oral Exam Simulator",
  description: "Practice your FAA checkride oral exam with an AI examiner that actually listens. Voice-first, ACS-scored, PPL + CPL + IR. Free trial — no credit card.",
  metadataBase: new URL('https://heydpe.com'),
  openGraph: {
    title: "HeyDPE — Your DPE Is Ready When You Are",
    description: "The only checkride oral exam simulator with real-time voice. Speak your answers, get scored on every ACS element. Try 3 sessions free.",
    siteName: "HeyDPE",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "HeyDPE — Your DPE Is Ready When You Are",
    description: "Practice your checkride oral with an AI examiner who listens. Voice-first. ACS-scored. Free trial.",
  },
  keywords: [
    "checkride oral exam", "DPE practice", "checkride prep",
    "oral exam simulator", "FAA checkride", "private pilot oral",
    "instrument oral", "commercial pilot oral", "ACS practice",
    "mock oral exam", "checkride anxiety", "AI examiner"
  ],
};
```

**Step 2: Add per-page metadata for landing page**

In `src/app/page.tsx`, add page-specific metadata export:

```typescript
export const metadata: Metadata = {
  title: "HeyDPE — Practice Your Checkride Oral With AI",
  description: "The only AI examiner you can actually talk to. Real-time voice, ACS element scoring, PPL + CPL + IR. 3 free sessions, no credit card.",
  openGraph: {
    title: "HeyDPE — Your DPE Is Ready When You Are. Let's Talk!",
    description: "Practice your checkride oral exam with an AI examiner that listens. Voice-first. ACS-scored. Try free.",
  },
};
```

**Step 3: Add per-page metadata for pricing page**

In `src/app/pricing/page.tsx`, add metadata (note: this is a client component so metadata must be moved to a separate `layout.tsx` or the page must be refactored). If client component, create `src/app/pricing/layout.tsx`:

```typescript
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — HeyDPE | $39/mo Unlimited Checkride Oral Practice",
  description: "Unlimited AI oral exam sessions for $39/month or $299/year. PPL, CPL, and Instrument Rating. 3 free sessions, no credit card required.",
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

**Step 4: Verify metadata renders**

Run: `npm run dev`
Open: `http://localhost:3000`
Inspect HTML `<head>` — verify og:title, og:description, twitter:card tags are present.

**Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx src/app/pricing/
git commit -m "feat: add OG meta tags and social sharing metadata for launch"
```

---

## Task 2: Add robots.txt and Sitemap

SEO basics — needed before any Google Ads or PR drives traffic. Currently neither exists.

**Files:**
- Create: `src/app/robots.ts`
- Create: `src/app/sitemap.ts`

**Step 1: Create robots.txt**

Create `src/app/robots.ts`:

```typescript
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin/', '/practice/', '/progress/', '/settings/'],
    },
    sitemap: 'https://heydpe.com/sitemap.xml',
  };
}
```

**Step 2: Create sitemap**

Create `src/app/sitemap.ts`:

```typescript
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://heydpe.com',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://heydpe.com/pricing',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: 'https://heydpe.com/login',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: 'https://heydpe.com/try',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
  ];
}
```

**Step 3: Verify**

Run: `npm run dev`
Open: `http://localhost:3000/robots.txt` — should render rules
Open: `http://localhost:3000/sitemap.xml` — should render XML sitemap

**Step 4: Commit**

```bash
git add src/app/robots.ts src/app/sitemap.ts
git commit -m "feat: add robots.txt and sitemap.xml for SEO"
```

---

## Task 3: Build Dedicated Ads Landing Page at /try

A conversion-optimized page separate from the homepage. Single purpose: convert ad clicks to trial signups. Minimal nav, demo video placeholder, 3 bullets, one CTA.

**Files:**
- Create: `src/app/try/page.tsx`

**Step 1: Create the ads landing page**

Create `src/app/try/page.tsx`. This is a server component (for metadata) with client interactivity kept minimal.

Key requirements from the marketing strategy:
- Demo video auto-playing (muted, click to unmute) — placeholder until video is recorded
- 3 bullet points: voice, ACS scoring, multi-rating
- Single CTA: "Let's talk!" → /login (signup flow)
- Comparison table: HeyDPE vs. CFI mock oral vs. text-based tools
- No main site navigation (remove exit paths)
- Mobile-first
- Social proof section (placeholder for testimonials)
- Match the existing dark cockpit design system (c-bg, c-amber, c-green, c-cyan)

```typescript
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Try HeyDPE Free — AI Checkride Oral Exam Practice",
  description:
    "Practice your checkride oral with an AI DPE who actually listens. 3 free sessions, no credit card. PPL, CPL, Instrument Rating.",
  openGraph: {
    title: "HeyDPE — Your DPE Is Ready When You Are. Let's Talk!",
    description:
      "The only voice-based checkride oral simulator. Try 3 sessions free.",
  },
};

export default function TryPage() {
  return (
    <div className="min-h-screen bg-c-bg">
      {/* Minimal header — no nav links, just logo */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-c-border bg-c-bg/80 backdrop-blur-lg">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between h-12">
          <Link href="/">
            <span className="font-mono font-bold text-c-amber glow-a text-sm tracking-widest">
              HEYDPE
            </span>
          </Link>
          <span className="font-mono text-[10px] text-c-muted tracking-wider">
            AI ORAL EXAM SIMULATOR
          </span>
        </div>
      </header>

      {/* Hero with demo video placeholder */}
      <section className="pt-20 pb-12 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="font-mono font-bold text-3xl sm:text-4xl text-c-amber glow-a leading-tight tracking-tight uppercase">
            PRACTICE YOUR CHECKRIDE<br />ORAL OUT LOUD
          </h1>
          <p className="mt-4 text-sm text-c-text/70 max-w-lg mx-auto leading-relaxed">
            The only AI examiner you can actually talk to. Speak your answers,
            get scored on every ACS element, and know exactly where you stand.
          </p>
        </div>

        {/* Demo video placeholder */}
        <div className="max-w-2xl mx-auto mt-8">
          <div className="aspect-video bezel rounded-lg border border-c-border flex items-center justify-center">
            {/* Replace this div with <video> or YouTube embed once demo is recorded */}
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-full border-2 border-c-amber/50 flex items-center justify-center mb-3">
                <span className="text-c-amber text-2xl">▶</span>
              </div>
              <p className="font-mono text-xs text-c-muted">
                DEMO VIDEO — COMING SOON
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="max-w-2xl mx-auto mt-8 text-center">
          <Link
            href="/login"
            className="inline-block px-10 py-4 bg-c-amber hover:bg-c-amber/90 text-c-bg rounded-lg font-mono font-semibold text-sm tracking-wide transition-colors shadow-lg shadow-c-amber/20"
          >
            LET&apos;S TALK! — START FREE
          </Link>
          <p className="mt-3 text-xs text-c-muted font-mono">
            3 FREE SESSIONS. NO CREDIT CARD. NO CATCH.
          </p>
        </div>
      </section>

      {/* 3 Bullets */}
      <section className="py-12 px-4 border-y border-c-border">
        <div className="max-w-2xl mx-auto grid sm:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-10 h-10 mx-auto rounded-full border-2 border-c-green/50 flex items-center justify-center mb-3">
              <span className="text-c-green text-sm">🎙</span>
            </div>
            <h3 className="font-mono font-semibold text-c-green text-xs mb-1 uppercase">
              SPEAK TO AN AI DPE
            </h3>
            <p className="text-c-muted text-xs leading-relaxed">
              Real-time voice interaction. Answer out loud, just like the real
              oral exam.
            </p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 mx-auto rounded-full border-2 border-c-amber/50 flex items-center justify-center mb-3">
              <span className="text-c-amber text-sm">✓</span>
            </div>
            <h3 className="font-mono font-semibold text-c-amber text-xs mb-1 uppercase">
              ACS ELEMENT SCORING
            </h3>
            <p className="text-c-muted text-xs leading-relaxed">
              Every knowledge element scored individually.
              Satisfactory, partial, or unsatisfactory.
            </p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 mx-auto rounded-full border-2 border-c-cyan/50 flex items-center justify-center mb-3">
              <span className="text-c-cyan text-sm">◈</span>
            </div>
            <h3 className="font-mono font-semibold text-c-cyan text-xs mb-1 uppercase">
              PPL + CPL + IR
            </h3>
            <p className="text-c-muted text-xs leading-relaxed">
              All three ratings included. 143+ ACS tasks. One subscription.
            </p>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-mono font-bold text-lg text-c-amber glow-a text-center mb-6 uppercase">
            HOW $39/MONTH COMPARES
          </h2>
          <div className="bezel rounded-lg border border-c-border overflow-hidden">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-c-border bg-c-panel/50">
                  <th className="text-left px-4 py-3 text-c-muted">OPTION</th>
                  <th className="text-center px-4 py-3 text-c-muted">COST</th>
                  <th className="text-center px-4 py-3 text-c-muted">VOICE</th>
                  <th className="text-center px-4 py-3 text-c-muted">SESSIONS</th>
                </tr>
              </thead>
              <tbody className="text-c-text">
                <tr className="border-b border-c-border bg-c-amber/5">
                  <td className="px-4 py-3 text-c-amber font-semibold">HeyDPE</td>
                  <td className="text-center px-4 py-3">$39/mo</td>
                  <td className="text-center px-4 py-3 text-c-green">YES</td>
                  <td className="text-center px-4 py-3">Unlimited</td>
                </tr>
                <tr className="border-b border-c-border">
                  <td className="px-4 py-3">CFI Mock Oral</td>
                  <td className="text-center px-4 py-3">$50-150</td>
                  <td className="text-center px-4 py-3 text-c-green">YES</td>
                  <td className="text-center px-4 py-3">1 session</td>
                </tr>
                <tr className="border-b border-c-border">
                  <td className="px-4 py-3">CheckrideAI</td>
                  <td className="text-center px-4 py-3">$399</td>
                  <td className="text-center px-4 py-3 text-c-red">NO</td>
                  <td className="text-center px-4 py-3">Text only</td>
                </tr>
                <tr className="border-b border-c-border">
                  <td className="px-4 py-3">Gleim DPE</td>
                  <td className="text-center px-4 py-3">$125/yr</td>
                  <td className="text-center px-4 py-3 text-c-red">NO</td>
                  <td className="text-center px-4 py-3">Text only</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">MockCheckride.com</td>
                  <td className="text-center px-4 py-3">$325</td>
                  <td className="text-center px-4 py-3 text-c-green">YES</td>
                  <td className="text-center px-4 py-3">1 session</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Social Proof Placeholder */}
      <section className="py-12 px-4 border-y border-c-border bg-c-panel/30">
        <div className="max-w-2xl mx-auto text-center">
          <p className="font-mono text-xs text-c-cyan glow-c tracking-[0.3em] uppercase mb-4">
            // PILOT FEEDBACK
          </p>
          {/* Replace with real testimonials as they come in */}
          <p className="text-c-muted text-sm italic">
            &ldquo;Testimonials coming soon — be one of the first to try it.&rdquo;
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-mono font-bold text-2xl text-c-amber glow-a mb-2 uppercase">
            YOUR DPE IS READY WHEN YOU ARE
          </h2>
          <p className="text-c-muted text-sm mb-8">
            Practice speaking. Pass flying.
          </p>
          <Link
            href="/login"
            className="inline-block px-10 py-4 bg-c-amber hover:bg-c-amber/90 text-c-bg rounded-lg font-mono font-semibold text-sm tracking-wide transition-colors shadow-lg shadow-c-amber/20"
          >
            LET&apos;S TALK! — START FREE
          </Link>
          <p className="mt-3 text-xs text-c-muted font-mono">
            3 FREE SESSIONS. NO CREDIT CARD REQUIRED.
          </p>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="py-6 px-4 border-t border-c-border">
        <p className="text-[10px] text-c-muted text-center font-mono max-w-xl mx-auto">
          FOR STUDY PURPOSES ONLY. NOT A SUBSTITUTE FOR INSTRUCTION FROM A
          CERTIFICATED FLIGHT INSTRUCTOR OR AN ACTUAL DPE CHECKRIDE.
          HEYDPE IS A PRODUCT OF IMAGINE FLYING LLC, JACKSONVILLE, FL.
        </p>
      </footer>
    </div>
  );
}
```

**Step 2: Verify the page renders**

Run: `npm run dev`
Open: `http://localhost:3000/try`
Check: page loads, CTA links to /login, comparison table renders, mobile responsive

**Step 3: Commit**

```bash
git add src/app/try/page.tsx
git commit -m "feat: add dedicated ads landing page at /try for launch campaign"
```

---

## Task 4: Update Homepage CTA and Tagline

Align the homepage with the finalized brand messaging: tagline "YOUR DPE IS READY WHEN YOU ARE" and CTA "LET'S TALK!"

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Update hero section**

In `src/app/page.tsx`, update the hero headline and CTA:

Change the h1 from:
```
YOUR DPE<br />IS READY
```
To:
```
YOUR DPE IS READY<br />WHEN YOU ARE
```

Change the primary CTA button text from `START PRACTICING FREE` to `LET'S TALK! — START FREE`.

Change the secondary CTA section heading from `READY TO ACE YOUR ORAL EXAM?` to `YOUR DPE IS READY WHEN YOU ARE`.

Change the secondary CTA button from `GET STARTED FREE` to `LET'S TALK!`.

**Step 2: Verify changes**

Run: `npm run dev`
Open: `http://localhost:3000`
Check: new tagline in hero, "Let's talk!" on CTA buttons

**Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: update homepage tagline and CTA to 'Let's talk!' for launch"
```

---

## Task 5: Add UTM Parameter Capture

Track which marketing channels drive signups. Capture UTM params from ad/post URLs and store them so we can attribute signups to channels.

**Files:**
- Create: `src/lib/utm.ts`
- Modify: `src/app/(auth)/login/page.tsx` (or the auth component that handles signup)

**Step 1: Create UTM utility**

Create `src/lib/utm.ts`:

```typescript
/**
 * UTM parameter capture and storage.
 * Reads utm_source, utm_medium, utm_campaign from URL on first visit.
 * Stores in sessionStorage so it persists across the signup flow.
 */

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const STORAGE_KEY = 'heydpe_utm';

export type UTMParams = Partial<Record<typeof UTM_KEYS[number], string>>;

export function captureUTMParams(): UTMParams | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const utm: UTMParams = {};
  let hasAny = false;

  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) {
      utm[key] = value;
      hasAny = true;
    }
  }

  if (hasAny) {
    // Only overwrite if we have new UTM params (first-touch attribution)
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(utm));
    } catch {
      // sessionStorage not available — ignore
    }
    return utm;
  }

  return null;
}

export function getStoredUTMParams(): UTMParams | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}
```

**Step 2: Capture UTM on page load**

Add UTM capture to the login page (the entry point for all auth). In the login page component, add a `useEffect`:

```typescript
import { captureUTMParams } from '@/lib/utm';

// Inside the component:
useEffect(() => {
  captureUTMParams();
}, []);
```

Also add it to the landing page (`src/app/page.tsx`) and the `/try` page — wherever users first land. Since these may be server components, add a small client component wrapper:

Create `src/components/UTMCapture.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { captureUTMParams } from '@/lib/utm';

export function UTMCapture() {
  useEffect(() => {
    captureUTMParams();
  }, []);
  return null;
}
```

Then add `<UTMCapture />` to server component pages that receive ad traffic.

**Step 3: Verify**

Open: `http://localhost:3000/try?utm_source=google&utm_medium=paid&utm_campaign=launch`
Check browser sessionStorage: `heydpe_utm` key should contain the params.

**Step 4: Commit**

```bash
git add src/lib/utm.ts src/components/UTMCapture.tsx src/app/try/page.tsx src/app/page.tsx
git commit -m "feat: add UTM parameter capture for marketing attribution"
```

---

## Task 6: Add /try Landing Page to Middleware Allow-List

The `/try` page must be publicly accessible (not behind auth). Verify the middleware doesn't block it.

**Files:**
- Modify: `src/lib/supabase/middleware.ts` (if `/try` is blocked by auth middleware)

**Step 1: Check if /try is accessible without auth**

Run: `npm run dev`
Open: `http://localhost:3000/try` in an incognito window (no session)
Check: page loads without redirect to /login

If it redirects → the middleware is blocking it. Add `/try` to the public routes list in `src/lib/supabase/middleware.ts`.

**Step 2: Fix if needed**

Look for the route protection logic in `src/lib/supabase/middleware.ts`. The protected routes are typically `/practice`, `/progress`, `/settings`. `/try` should NOT be protected. If it is, add it to the allow-list alongside `/`, `/pricing`, `/login`.

**Step 3: Verify**

Incognito window: `http://localhost:3000/try` → page loads, no redirect.

**Step 4: Commit (if changes were needed)**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "fix: ensure /try landing page is publicly accessible"
```

---

## Task 7: Prep Week Non-Technical Checklist

These tasks are NOT code — they are marketing execution tasks that must be completed during Prep Week before Launch Day.

**Reference:** See Obsidian → HeyDPE → Marketing/ for all templates and creative briefs.

### 7a: Record Demo Video (Monday of Prep Week)

- [ ] Set up OBS or QuickTime screen recording
- [ ] Open HeyDPE in Chrome, start a real PPL session
- [ ] Record full 60-90 second session with voice interaction
  - AI DPE asks a question (voice playing)
  - Speak answer naturally (include a natural pause)
  - AI DPE responds and follows up
  - Score appears on screen
  - Quick flash of progress dashboard
- [ ] Record with face cam in bottom-right corner
- [ ] Edit into two cuts: Full (90s) and Short (30s)
- [ ] Add end card: "Your DPE is ready when you are. Let's talk!" → heydpe.com
- [ ] Upload Full to YouTube (unlisted initially)
- [ ] See Obsidian → Marketing → [[Demo Video Brief]] for full spec

### 7b: Set Up Google Ads Account (Monday of Prep Week)

- [ ] Create Google Ads account at ads.google.com
- [ ] Set up billing
- [ ] Create Campaign 1: High-Intent Checkride Keywords (4 ad groups)
- [ ] Create Campaign 2: Branded Terms
- [ ] Write 3 ad copy variations per the spec
- [ ] Add sitelink, callout, and structured snippet extensions
- [ ] Set daily budget: $15-20/day
- [ ] Add negative keywords
- [ ] Set conversion tracking: install Google Ads tag on site, configure "signup" as conversion event
- [ ] DO NOT activate — keep paused until Launch Day
- [ ] See Obsidian → Marketing → [[Ad Copy & Keywords]] for full spec

### 7c: Set Up Email Capture & Nurture (Tuesday of Prep Week)

- [ ] Sign up for Resend (resend.com) — free tier handles launch volume
- [ ] Configure sending domain (heydpe.com)
- [ ] Create 3-email automated sequence per the spec
- [ ] Test deliverability (send test to Gmail, Outlook, Yahoo)
- [ ] Wire signup event to trigger Email 1
- [ ] See Obsidian → Marketing → [[Email Nurture Sequence]] for full copy

### 7d: Prepare CFI Outreach List (Thursday of Prep Week)

- [ ] List 10-20 CFIs by name, contact info, relationship context
- [ ] Write personalized message for each (not template — personal)
- [ ] Write forwarding template they can send to students
- [ ] See Obsidian → Marketing → [[Launch Post Templates#CFI Forwarding Message]] for template

### 7e: Final Pre-Launch Verification (Friday of Prep Week)

- [ ] Free trial limits enforced? (3 sessions, 15 questions)
- [ ] Signup flow works end-to-end (desktop + mobile + iPad)
- [ ] Landing page /try loads fast (<3 seconds)
- [ ] Demo video plays without buffering
- [ ] Email capture fires on signup
- [ ] Google Ads campaigns ready but paused
- [ ] All Reddit/forum posts pre-written (see Obsidian → Marketing → [[Launch Post Templates]])
- [ ] All PR pitches pre-written (see Obsidian → Marketing → [[PR Pitch Templates]])
- [ ] UTM links tested: heydpe.com/try?utm_source=reddit&utm_medium=organic&utm_campaign=launch

---

## Task 8: Launch Day Execution

**Reference:** Obsidian → Marketing → [[Launch Day Playbook]]

This is a non-code task. The playbook has hour-by-hour instructions. Key milestones:

- 8:00 AM ET: Activate Google Ads
- 9:00 AM ET: Post to r/flying + send CFI outreach
- 9:30 AM ET: Post to aviation Discord servers
- All day: Monitor and respond to every comment
- 8:00 PM ET: Evening metrics review

Target: 10-30 signups on Day 1.

---

## Summary: Task Order and Dependencies

```
Task 1: OG Meta Tags ─────────────────┐
Task 2: robots.txt + Sitemap ─────────┤
Task 3: /try Landing Page ────────────┼── All can be done in parallel
Task 4: Homepage CTA Update ──────────┤
Task 5: UTM Capture ──────────────────┤
Task 6: Middleware Check for /try ─────┘ (depends on Task 3)
                                       │
                                       ▼
                              Deploy to Vercel
                                       │
                                       ▼
Task 7: Prep Week (non-technical) ─── Demo video, Google Ads, email, CFI list
                                       │
                                       ▼
Task 8: Launch Day Execution ──────── Go live
```

Tasks 1-5 are independent and can be parallelized. Task 6 depends on Task 3. Tasks 7-8 are non-technical and sequential.
