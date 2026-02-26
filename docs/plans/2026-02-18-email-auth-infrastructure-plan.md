# Email & Auth Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Integrate Resend for transactional emails (welcome, subscription, payment), build an inbound email webhook with routing (support tickets + employee forwarding), and wire up the support ticket admin UI.

**Architecture:** Single email service module (`src/lib/email.ts`) wrapping the Resend API. React Email templates for branded HTML emails. Inbound webhook handler at `/api/webhooks/resend-inbound` with Svix signature verification. Support tickets stored in Supabase with admin-only RLS. Admin dashboard page for ticket management.

**Tech Stack:** Next.js App Router, Resend (email API + inbound webhooks), React Email, Svix (webhook verification), Supabase (PostgreSQL + RLS), TypeScript, Tailwind CSS v4

---

## Context

The design document is at `docs/plans/2026-02-18-email-auth-infrastructure-design.md`. Read it for full context.

### What Already Works (Don't Touch)

- Login page at `src/app/(auth)/login/page.tsx` — Email OTP + 3 OAuth buttons (Google, Apple, Microsoft)
- Auth callback at `src/app/auth/callback/route.ts` — Code exchange, OTP verification, login tracking
- Supabase SMTP via Resend — OTP emails sent from `noreply@heydpe.com`
- DNS records — DKIM, SPF, DMARC, MX all configured in Route 53
- Resend API keys — `RESEND_API_KEY` (send-only) and `RESEND_INBOUND_API_KEY` (full access) in Vercel env vars

### What This Plan Builds

1. Resend npm package + React Email + Svix
2. Email service module with send functions
3. Branded email templates (welcome, subscription confirmed/cancelled, payment failed)
4. Welcome email trigger in auth callback
5. Subscription/payment email triggers in Stripe webhook
6. Support tickets database migration
7. Inbound email webhook handler with routing
8. Support tickets admin page
9. Unit tests for email routing logic

### What This Plan Does NOT Build (External Human Tasks)

- Apple OAuth — Requires Apple Developer Portal + Supabase Dashboard configuration (no code changes)
- Microsoft OAuth — Requires Azure Portal + Supabase Dashboard configuration (no code changes)
- These are documented in the Obsidian vault at `Email & Auth Infrastructure/OAuth Provider Configuration.md`

---

## Task 1: Install Dependencies + Environment Variables

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `.env.example`

**Steps:**

1. Install npm packages:
```bash
npm install resend @react-email/components svix
```

2. Update `.env.example` to document all email-related env vars:
```
# Resend (email service — outbound + inbound)
RESEND_API_KEY=re_...
RESEND_INBOUND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...
EMAIL_FORWARD_TO=your-personal@email.com
```

3. Verify `.env.local` has the Resend keys (they should already be there from Vercel sync, but add `RESEND_WEBHOOK_SECRET` and `EMAIL_FORWARD_TO` placeholders).

4. Run `npx tsc --noEmit` to verify no type errors from new packages.

---

## Task 2: Create Email Service Module + Unit Tests

**Files:**
- Create: `src/lib/email.ts`
- Create: `src/lib/__tests__/email.test.ts`

**Email service module (`src/lib/email.ts`):**

```typescript
import { Resend } from 'resend';

// Initialize Resend client — server-only
const resend = new Resend(process.env.RESEND_API_KEY);

// Sender addresses (all verified under heydpe.com domain)
const SENDERS = {
  hello: 'HeyDPE <hello@heydpe.com>',
  billing: 'HeyDPE Billing <billing@heydpe.com>',
  support: 'HeyDPE Support <support@heydpe.com>',
  noreply: 'HeyDPE <noreply@heydpe.com>',
} as const;

export async function sendWelcomeEmail(to: string, name?: string): Promise<void> {
  // Import React Email template
  // Render and send via Resend API
  // Log success/failure, never throw (fire-and-forget at call sites)
}

export async function sendSubscriptionConfirmed(to: string, plan: 'monthly' | 'annual'): Promise<void> {
  // plan: 'monthly' ($39/mo) or 'annual' ($299/yr)
}

export async function sendSubscriptionCancelled(to: string): Promise<void> { }

export async function sendPaymentFailed(to: string): Promise<void> { }

export async function sendTicketReply(
  to: string,
  subject: string,
  body: string,
  inReplyTo?: string
): Promise<string | null> {
  // Returns Resend email ID for tracking
}

export async function forwardEmail(
  originalFrom: string,
  originalTo: string,
  subject: string,
  bodyText: string,
  bodyHtml?: string
): Promise<void> {
  // Forward to EMAIL_FORWARD_TO env var
}
```

**Key design decisions:**
- All functions are `async` and catch errors internally — they log but never throw
- `sendWelcomeEmail` and subscription emails render React Email templates to HTML
- `forwardEmail` sends plain text with original headers
- `sendTicketReply` returns the Resend email ID so ticket_replies can store it

**Unit tests (`src/lib/__tests__/email.test.ts`):**

Mock the Resend client. Test:
- `sendWelcomeEmail` calls `resend.emails.send` with correct `from`, `to`, `subject`
- `sendSubscriptionConfirmed` includes plan name and price
- `forwardEmail` includes original sender info in body
- All functions handle errors gracefully (log, don't throw)
- `sendTicketReply` sets `In-Reply-To` header when `inReplyTo` provided

---

## Task 3: Create Email Templates

**Files:**
- Create: `src/emails/layout.tsx`
- Create: `src/emails/welcome.tsx`
- Create: `src/emails/subscription-confirmed.tsx`
- Create: `src/emails/subscription-cancelled.tsx`
- Create: `src/emails/payment-failed.tsx`

**Shared layout (`src/emails/layout.tsx`):**

Uses `@react-email/components`: `Html`, `Head`, `Body`, `Container`, `Section`, `Text`, `Link`, `Img`, `Hr`.

Design guidelines (matching cockpit design system):
- Background: `#0a0a0a` (near-black)
- Card background: `#1a1a1a`
- Primary text: `#e5e5e5`
- Muted text: `#737373`
- Accent: `#f59e0b` (amber)
- Font: `-apple-system, system-ui, sans-serif` (email-safe, monospace doesn't render well in email clients)
- Header: HeyDPE logo text in amber
- Footer: Unsubscribe link (where applicable), Imagine Flying LLC, Jacksonville FL, Privacy Policy link

**Welcome email (`src/emails/welcome.tsx`):**

```
Subject: Welcome to HeyDPE — Your DPE is ready

[HeyDPE LOGO]

Hey {name || 'pilot'},

Welcome to HeyDPE. You now have access to an AI-powered DPE
that's available 24/7 to help you prepare for your checkride oral exam.

Here's what you can do:
• Practice with 143+ ACS tasks across PPL, CPL, and IR
• Get scored on every answer (satisfactory, partial, unsatisfactory)
• Track your progress and identify weak areas

[START YOUR FIRST SESSION →] (button → https://heydpe.com/practice)

You have 3 free practice sessions. After that, plans start at $39/month.

Questions? Reply to this email or reach us at support@heydpe.com.

Clear skies,
The HeyDPE Team

---
Imagine Flying LLC · Jacksonville, FL
Privacy Policy (link) · Terms of Service (link)
```

**Subscription confirmed (`src/emails/subscription-confirmed.tsx`):**

```
Subject: Your HeyDPE subscription is active

Your {plan} plan is now active. Here's what you get:
• Unlimited practice sessions
• Voice mode with AI DPE
• Full progress tracking across all ratings

[Monthly: $39/month, renews automatically]
[Annual: $299/year ($24.92/month), renews automatically]

Manage your subscription anytime from Settings.

[GO TO PRACTICE →]
```

**Subscription cancelled (`src/emails/subscription-cancelled.tsx`):**

```
Subject: Your HeyDPE subscription has been cancelled

Your subscription has been cancelled. You'll continue to have
access until the end of your current billing period.

After that, you can still sign in but won't be able to start
new practice sessions.

Changed your mind? You can resubscribe anytime.

[VIEW PRICING →]
```

**Payment failed (`src/emails/payment-failed.tsx`):**

```
Subject: Action needed — Payment failed for HeyDPE

We couldn't process your payment. Please update your billing
information to keep your subscription active.

[UPDATE BILLING →] (button → https://heydpe.com/settings)

If we can't process payment within 7 days, your subscription
will be paused.
```

---

## Task 4: Wire Welcome Email into Auth Callback

**Files:**
- Modify: `src/app/auth/callback/route.ts`

**Changes:**

1. Modify `ensureProfile()` to return a boolean indicating whether the profile was just created (new user vs returning user):

```typescript
async function ensureProfile(userId: string): Promise<boolean> {
  const { data } = await serviceSupabase
    .from('user_profiles')
    .select('user_id')
    .eq('user_id', userId)
    .single();

  if (!data) {
    const { error } = await serviceSupabase
      .from('user_profiles')
      .insert({ user_id: userId, tier: 'checkride_prep', subscription_status: 'none' });

    if (error && !error.message.includes('duplicate')) {
      console.error('[auth/callback] Failed to create user profile:', error.message);
      return false;
    }
    return true; // New profile created
  }
  return false; // Existing user
}
```

2. After the OAuth/OTP success paths, check if new user and send welcome email:

```typescript
if (user) {
  void trackLogin(user.id, user.app_metadata?.provider);
  const isNewUser = await ensureProfile(user.id);
  if (isNewUser && user.email) {
    const name = user.user_metadata?.full_name || user.user_metadata?.name;
    void sendWelcomeEmail(user.email, name ?? undefined);
  }
}
```

**Important:** `ensureProfile` changes from fire-and-forget to awaited (only for the boolean return), but `sendWelcomeEmail` remains fire-and-forget (void).

---

## Task 5: Wire Subscription/Payment Emails into Stripe Webhook

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts`

**Changes:**

Add email sends at the end of each event handler (after all database updates succeed):

1. **`checkout.session.completed`** (after tier update succeeds):
```typescript
import { sendSubscriptionConfirmed } from '@/lib/email';

// At end of checkout.session.completed handler:
if (customerEmail) {
  const plan = priceId === process.env.STRIPE_PRICE_ANNUAL ? 'annual' : 'monthly';
  void sendSubscriptionConfirmed(customerEmail, plan);
}
```

The `customerEmail` is already available in the handler — it's extracted from the Stripe session object.

2. **`customer.subscription.deleted`** (after tier downgrade):
```typescript
import { sendSubscriptionCancelled } from '@/lib/email';

// At end of customer.subscription.deleted handler:
// Need to look up user email from user_id
const { data: profile } = await serviceSupabase
  .from('user_profiles')
  .select('user_id')
  .eq('stripe_customer_id', subscription.customer)
  .single();

if (profile) {
  const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(profile.user_id);
  if (user?.email) {
    void sendSubscriptionCancelled(user.email);
  }
}
```

3. **`invoice.payment_failed`** (after status update):
```typescript
import { sendPaymentFailed } from '@/lib/email';

// Similar lookup pattern as above
// void sendPaymentFailed(userEmail);
```

**Reference file:** Read `src/app/api/stripe/webhook/route.ts` to understand the exact structure and where to add these calls. The webhook already has access to Stripe event data and Supabase service client.

---

## Task 6: Support Tickets Database Migration

**Files:**
- Create: `supabase/migrations/20260218_support_tickets.sql`

**Migration SQL:**

```sql
-- Support tickets from inbound email
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_email_id TEXT UNIQUE,
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT,
  body_html TEXT,
  ticket_type TEXT NOT NULL DEFAULT 'support'
    CHECK (ticket_type IN ('support', 'feedback')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reply_count INT NOT NULL DEFAULT 0,
  last_reply_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ticket conversation thread
CREATE TABLE ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_email TEXT NOT NULL,
  body_text TEXT,
  body_html TEXT,
  resend_email_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_tickets_status ON support_tickets(status);
CREATE INDEX idx_tickets_created ON support_tickets(created_at DESC);
CREATE INDEX idx_tickets_from_email ON support_tickets(from_email);
CREATE INDEX idx_tickets_user ON support_tickets(user_id);
CREATE INDEX idx_replies_ticket ON ticket_replies(ticket_id, created_at);

-- RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_replies ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "admin_tickets_all" ON support_tickets
  FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_replies_all" ON ticket_replies
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM support_tickets t
    WHERE t.id = ticket_replies.ticket_id
    AND auth.uid() IN (SELECT user_id FROM admin_users)
  ));

-- Service role needs insert access for webhook handler
-- (Service role bypasses RLS by default, so no policy needed)

-- Updated_at trigger (reuse pattern from user_profiles)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Apply migration:**
```bash
npx supabase db push
# OR if using remote:
npx supabase migration up --linked
```

**Add TypeScript types** to `src/types/database.ts`:

```typescript
export interface SupportTicket {
  id: string;
  resend_email_id: string | null;
  from_email: string;
  from_name: string | null;
  to_address: string;
  subject: string;
  body_text: string | null;
  body_html: string | null;
  ticket_type: 'support' | 'feedback';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assigned_to: string | null;
  user_id: string | null;
  reply_count: number;
  last_reply_at: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketReply {
  id: string;
  ticket_id: string;
  direction: 'inbound' | 'outbound';
  from_email: string;
  body_text: string | null;
  body_html: string | null;
  resend_email_id: string | null;
  created_at: string;
}
```

---

## Task 7: Inbound Email Webhook Handler + Routing Logic

**Files:**
- Create: `src/app/api/webhooks/resend-inbound/route.ts`
- Create: `src/lib/email-routing.ts` (pure logic, testable)
- Create: `src/lib/__tests__/email-routing.test.ts`

**Email routing module (`src/lib/email-routing.ts`):**

Pure functions with zero external dependencies (same pattern as `exam-logic.ts`):

```typescript
export type EmailRoute =
  | { action: 'create_ticket'; type: 'support' | 'feedback' }
  | { action: 'forward'; to: string }
  | { action: 'ignore' };

const TICKET_ADDRESSES: Record<string, 'support' | 'feedback'> = {
  'support@heydpe.com': 'support',
  'feedback@heydpe.com': 'feedback',
};

export function routeEmail(
  toAddresses: string[],
  forwardTo: string | undefined
): EmailRoute {
  // Check each recipient against ticket addresses
  for (const addr of toAddresses) {
    const normalized = addr.toLowerCase().trim();
    if (normalized in TICKET_ADDRESSES) {
      return { action: 'create_ticket', type: TICKET_ADDRESSES[normalized] };
    }
  }

  // Forward if configured
  if (forwardTo) {
    return { action: 'forward', to: forwardTo };
  }

  return { action: 'ignore' };
}

export function extractEmailAddress(rawFrom: string): string {
  // "John Doe <john@example.com>" → "john@example.com"
  // "john@example.com" → "john@example.com"
  const match = rawFrom.match(/<([^>]+)>/);
  return (match ? match[1] : rawFrom).toLowerCase().trim();
}

export function extractEmailName(rawFrom: string): string | null {
  // "John Doe <john@example.com>" → "John Doe"
  const match = rawFrom.match(/^([^<]+)</);
  return match ? match[1].trim() : null;
}
```

**Unit tests (`src/lib/__tests__/email-routing.test.ts`):**

```typescript
// routeEmail tests:
// - support@heydpe.com → create_ticket(support)
// - feedback@heydpe.com → create_ticket(feedback)
// - pd@heydpe.com with forwardTo set → forward
// - random@heydpe.com with forwardTo set → forward (catch-all)
// - random@heydpe.com without forwardTo → ignore
// - Case insensitive: Support@HeyDPE.com → create_ticket
// - Multiple recipients: [support@heydpe.com, pd@heydpe.com] → create_ticket (support wins)

// extractEmailAddress tests:
// - "John Doe <john@example.com>" → "john@example.com"
// - "john@example.com" → "john@example.com"
// - "<JOHN@Example.Com>" → "john@example.com"

// extractEmailName tests:
// - "John Doe <john@example.com>" → "John Doe"
// - "john@example.com" → null
// - "<john@example.com>" → null
```

**Webhook handler (`src/app/api/webhooks/resend-inbound/route.ts`):**

```typescript
import { Webhook } from 'svix';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { routeEmail, extractEmailAddress, extractEmailName } from '@/lib/email-routing';
import { forwardEmail } from '@/lib/email';

const resendInbound = new Resend(process.env.RESEND_INBOUND_API_KEY);
const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  // 1. Verify webhook signature
  const body = await request.text();
  const headers = {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  };

  const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET!);
  let event: any;
  try {
    event = wh.verify(body, headers);
  } catch {
    return new Response('Invalid signature', { status: 401 });
  }

  // 2. Only handle email.received events
  if (event.type !== 'email.received') {
    return new Response('OK', { status: 200 });
  }

  const { email_id, from, to, subject } = event.data;

  // 3. Route the email
  const route = routeEmail(to, process.env.EMAIL_FORWARD_TO);

  // 4. Fetch full email body from Resend API
  let bodyText: string | null = null;
  let bodyHtml: string | null = null;
  try {
    const emailData = await resendInbound.emails.get(email_id);
    // Note: Resend Receiving API returns body differently
    // Use the receiving endpoint: GET /emails/receiving/{emailId}
    const resp = await fetch(`https://api.resend.com/emails/receiving/${email_id}`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_INBOUND_API_KEY}` },
    });
    if (resp.ok) {
      const data = await resp.json();
      bodyText = data.text ?? null;
      bodyHtml = data.html ?? null;
    }
  } catch (err) {
    console.error('[resend-inbound] Failed to fetch email body:', err);
  }

  // 5. Execute route
  const fromEmail = extractEmailAddress(from);
  const fromName = extractEmailName(from);

  if (route.action === 'create_ticket') {
    // Match from_email to existing HeyDPE user
    const { data: userProfile } = await serviceSupabase
      .from('user_profiles')
      .select('user_id')
      .eq('user_id', (
        await serviceSupabase.rpc('get_user_id_by_email', { email_arg: fromEmail })
      ).data)
      .single();
    // Simpler: look up user in auth.users by email (requires admin API)

    await serviceSupabase.from('support_tickets').insert({
      resend_email_id: email_id,
      from_email: fromEmail,
      from_name: fromName,
      to_address: to[0],
      subject: subject || '(no subject)',
      body_text: bodyText,
      body_html: bodyHtml,
      ticket_type: route.type,
    });

  } else if (route.action === 'forward') {
    await forwardEmail(from, to[0], subject || '(no subject)', bodyText || '', bodyHtml ?? undefined);
  }

  return new Response('OK', { status: 200 });
}
```

**User lookup approach:** Use Supabase Admin API to find user by email:
```typescript
const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({
  filter: { email: fromEmail },
  page: 1,
  perPage: 1,
});
const userId = users?.[0]?.id ?? null;
```

---

## Task 8: Support Tickets Admin API

**Files:**
- Create: `src/app/api/admin/support/route.ts`

**API route supporting:**

**`GET /api/admin/support`** — List tickets with filtering

Query params: `status` (open, in_progress, resolved, closed, all), `type` (support, feedback, all)

Returns:
```typescript
{
  tickets: SupportTicket[];
  counts: { open: number; in_progress: number; resolved: number; closed: number; total: number };
}
```

**`GET /api/admin/support?id={ticketId}`** — Get single ticket with replies

Returns:
```typescript
{
  ticket: SupportTicket;
  replies: TicketReply[];
}
```

**`PATCH /api/admin/support`** — Update ticket (status, priority, notes, assigned_to)

**`POST /api/admin/support`** — Send reply to ticket

Body: `{ ticketId, body }`

Sends reply via Resend API (from `support@heydpe.com`), creates `ticket_replies` row with `direction: 'outbound'`, increments `reply_count`, updates `last_reply_at`.

**Auth:** All endpoints use `requireAdmin(request)` from `@/lib/admin-guard`.

---

## Task 9: Support Tickets Admin Page

**Files:**
- Create: `src/app/(admin)/admin/support/page.tsx`
- Modify: `src/app/(admin)/AdminShell.tsx` (add sidebar nav entry)

**Sidebar nav update (`AdminShell.tsx`):**

Add between Analytics and Users in the OVERVIEW section:

```typescript
{ href: '/admin/support', label: 'Support', icon: '✉' },
```

**Page layout:**

Follow the exact same patterns as `src/app/(admin)/admin/page.tsx` (dashboard) and `src/app/(admin)/admin/analytics/page.tsx`:
- `'use client'` directive
- `useState` for tickets, selectedTicket, loading, error
- `useCallback` for fetch functions
- `useEffect` on mount

```
HEADER: "SUPPORT TICKETS" + refresh button + counts (X open, Y total)

STATUS FILTER TABS: [All] [Open] [In Progress] [Resolved]

SPLIT VIEW:
┌─────────────────────────┬──────────────────────────────┐
│ TICKET LIST (left 40%)  │ TICKET DETAIL (right 60%)    │
│                         │                              │
│ ● Subject line          │ From: name <email>           │
│   from@email · 2h ago   │ Subject: ...                 │
│                         │ Status: [dropdown]           │
│ ● Another ticket        │ Priority: [dropdown]         │
│   from@email · 1d ago   │                              │
│                         │ CONVERSATION:                │
│                         │ [Customer] message (time)    │
│                         │ [Admin] reply (time)         │
│                         │                              │
│                         │ REPLY:                       │
│                         │ [textarea]                   │
│                         │ [Send Reply]                 │
│                         │                              │
│                         │ NOTES (internal):            │
│                         │ [textarea] [Save]            │
└─────────────────────────┴──────────────────────────────┘
```

**Status dots:**
- Open: amber dot
- In progress: cyan dot
- Resolved: green dot
- Closed: dim dot

**Inline components (defined within the page file):**
- `TicketRow` — List item in left panel
- `TicketDetail` — Right panel with conversation + reply
- `StatusBadge` — Colored status indicator
- `PriorityBadge` — Priority label

**Cockpit design system classes to use:** `bezel`, `rounded-lg`, `border border-c-border`, `font-mono`, `text-c-amber`, `text-c-cyan`, `text-c-muted`, `bg-c-panel`, `iframe` (for conversation area).

---

## Task 10: Verification & Testing

**Automated tests:**
```bash
npm test                    # Unit tests (email-routing, email service)
npx tsc --noEmit           # TypeScript check
npm run build              # Build verification
```

**Manual verification checklist:**

1. **Email service:**
   - [ ] Import `sendWelcomeEmail` and verify it doesn't error with mock Resend key
   - [ ] Verify React Email templates render (can use `npx email dev` if react-email CLI is available)

2. **Auth callback welcome email:**
   - [ ] Sign up with a new email → verify welcome email is sent (check Resend dashboard logs)
   - [ ] Sign in with existing email → verify NO welcome email sent

3. **Stripe webhook emails:**
   - [ ] Verify imports don't break the existing webhook handler
   - [ ] Test with Stripe test events (via Stripe CLI or dashboard)

4. **Inbound webhook:**
   - [ ] Send test email to `support@heydpe.com` → verify ticket created in Supabase
   - [ ] Send test email to `pd@heydpe.com` → verify forwarded to personal email
   - [ ] Verify webhook signature validation rejects bad signatures

5. **Admin support page:**
   - [ ] Navigate to `/admin/support` → page loads
   - [ ] Ticket list shows tickets from step 4
   - [ ] Click ticket → detail panel shows
   - [ ] Send reply → email received by original sender
   - [ ] Change status → database updated

6. **Build:**
   - [ ] `npm run build` succeeds with 0 errors
   - [ ] Deploy to Vercel preview → all routes work

---

## Execution Order

| Order | Task | Dependencies | Estimated Effort |
|-------|------|-------------|-----------------|
| 1 | Task 1: Install dependencies + env vars | None | 5 min |
| 2 | Task 7 (routing logic + tests only) | Task 1 | 30 min |
| 3 | Task 2: Email service module + tests | Task 1 | 45 min |
| 4 | Task 3: Email templates | Task 2 | 30 min |
| 5 | Task 4: Welcome email in auth callback | Task 2 | 15 min |
| 6 | Task 5: Subscription emails in Stripe webhook | Task 2 | 20 min |
| 7 | Task 6: Database migration | None (can parallel with 2-5) | 15 min |
| 8 | Task 7 (webhook handler) | Task 2, 6, 7-routing | 30 min |
| 9 | Task 8: Support admin API | Task 6 | 30 min |
| 10 | Task 9: Support admin page | Task 8 | 45 min |
| 11 | Task 10: Verification | All | 20 min |

**Total estimated:** ~4-5 hours of implementation

---

## Critical Files Reference

| File | Role |
|------|------|
| `src/app/(auth)/login/page.tsx` | Login UI (DON'T MODIFY — already complete) |
| `src/app/auth/callback/route.ts` | Auth callback (MODIFY — add welcome email) |
| `src/app/api/stripe/webhook/route.ts` | Stripe webhook (MODIFY — add email sends) |
| `src/app/(admin)/AdminShell.tsx` | Admin sidebar nav (MODIFY — add Support entry) |
| `src/app/(admin)/admin/page.tsx` | Dashboard (REFERENCE — copy patterns) |
| `src/app/(admin)/admin/analytics/page.tsx` | Analytics (REFERENCE — copy patterns) |
| `src/lib/admin-guard.ts` | `requireAdmin()`, `handleAdminError()` |
| `src/types/database.ts` | TypeScript interfaces (MODIFY — add ticket types) |
| `supabase/migrations/` | Migration directory |
| `.env.example` | Environment variable documentation |
