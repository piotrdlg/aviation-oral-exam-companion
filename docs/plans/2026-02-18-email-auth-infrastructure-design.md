# Email & Auth Infrastructure Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Integrate Resend for all email (transactional outbound + inbound routing + employee forwarding), configure all three OAuth providers (Google, Apple, Microsoft), and build a support ticket system backed by Supabase.

**Architecture:** Unified Resend-centric email with webhook-based inbound routing, Supabase Auth for all authentication (OTP + 3 OAuth providers), React Email templates for branded transactional emails, and a support_tickets table for customer service.

**Tech Stack:** Next.js App Router, Resend (email API + inbound webhooks), Supabase Auth (OTP + OAuth), React Email, TypeScript, Tailwind CSS v4

---

## Context

HeyDPE has a working authentication system (Email OTP + Google OAuth) and Resend configured as Supabase's SMTP provider for OTP codes. However:

- Apple and Microsoft OAuth buttons exist in the UI but providers aren't configured in Supabase
- No transactional emails exist (welcome, subscription confirmation, etc.)
- MX records point to Resend but no inbound webhook handler exists
- No support ticket system
- No employee email forwarding
- `resend` npm package not installed

### What Already Works

| Component | Status |
|-----------|--------|
| Email OTP (passwordless) | Working via Supabase + Resend SMTP |
| Google OAuth | Working (configured in Supabase) |
| Login page with all 3 OAuth buttons | Deployed |
| Auth callback with login tracking | Deployed |
| Resend API keys in Vercel | Configured (send-only + full-access) |
| DNS (DKIM, SPF, DMARC, MX) | All configured in Route 53 |
| Resend domain verification | Verified for heydpe.com |

### What Needs Building

| Component | Scope |
|-----------|-------|
| Apple OAuth | Apple Developer Portal config + Supabase provider setup |
| Microsoft OAuth | Azure Entra ID app registration + Supabase provider setup |
| Resend npm package | Install `resend` + `@react-email/components` |
| Email service module | `src/lib/email.ts` — centralized send functions |
| Email templates | React Email templates for welcome, subscription, payment |
| Inbound webhook handler | `/api/webhooks/resend-inbound` route |
| Email routing logic | Forward pd@, create tickets for support@/feedback@ |
| Support tickets table | Supabase migration + RLS policies |
| Support admin UI | `/admin/support` page |
| Welcome email trigger | Auth callback sends welcome on first login |
| Stripe email triggers | Webhook sends subscription/payment emails |

---

## Design Decisions

### D1: Resend for Everything

**Decision:** Use Resend as the single email provider for all outbound (transactional + notifications) and inbound (webhook) email.

**Rationale:** DNS already configured, API keys already provisioned, domain verified. Adding a second provider (SendGrid, Mailgun) would require additional DNS records and split email management.

**Limitation:** Resend free tier is 100 emails/day, 3,000/month. Sufficient for launch. Upgrade to Pro ($20/month, 50k/month) when needed.

### D2: React Email for Templates

**Decision:** Use `@react-email/components` for email templates rather than raw HTML or Handlebars.

**Rationale:** Same component model as the app (React + TypeScript), type-safe, preview-able in development, matches the cockpit design system aesthetic.

### D3: Support Tickets in Supabase (Not External Helpdesk)

**Decision:** Store support emails as rows in a `support_tickets` table with replies in `ticket_replies`.

**Rationale:** At current scale (pre-launch), an external helpdesk is overkill. Supabase gives full control, costs nothing, and integrates with the admin dashboard. Migrate to a proper helpdesk when ticket volume justifies it.

### D4: Employee Forwarding via Webhook (Not Cloudflare)

**Decision:** Forward `pd@heydpe.com` emails via the same Resend inbound webhook handler, re-sending to personal email via Resend API.

**Rationale:** DNS is on Route 53 (not Cloudflare), MX already points to Resend, and building forwarding is ~20 lines of code. Avoids migrating DNS.

### D5: No Code Changes for OAuth

**Decision:** Apple and Microsoft OAuth require only external configuration (Apple Developer Portal, Azure Portal, Supabase Dashboard). The login page code already handles all three providers.

**Rationale:** The login page already has buttons for Google, Apple, and Microsoft using `signInWithOAuth({ provider })`. Supabase handles the OAuth flow once the provider is configured.

---

## Email Architecture

### Outbound Email

```
src/lib/email.ts (Resend client)
        │
        ├── sendWelcomeEmail(email, name?)
        ├── sendSubscriptionConfirmed(email, plan)
        ├── sendSubscriptionCancelled(email)
        ├── sendPaymentFailed(email)
        └── sendTicketReply(email, subject, body)
                │
                ▼
         Resend API (RESEND_API_KEY)
                │
                ▼
         Delivered from hello@heydpe.com or billing@heydpe.com
```

**Sender addresses:**
- `noreply@heydpe.com` — OTP codes (via Supabase SMTP, already working)
- `hello@heydpe.com` — Welcome email, general notifications
- `billing@heydpe.com` — Subscription/payment-related emails
- `support@heydpe.com` — Replies to support tickets

All addresses work automatically since `heydpe.com` domain is verified in Resend.

### Inbound Email

```
Email sent to *@heydpe.com
        │
        ▼
Resend (MX: inbound-smtp.us-east-1.amazonaws.com)
        │
        ▼
Webhook POST → /api/webhooks/resend-inbound
        │
        ├── Verify webhook signature
        ├── Fetch full email body via Resend API
        │
        ├── support@heydpe.com → Insert into support_tickets
        ├── feedback@heydpe.com → Insert into support_tickets (type: feedback)
        ├── pd@heydpe.com → Forward via Resend send API
        └── *@heydpe.com → Forward to pd@ personal email (catch-all)
```

### Email Templates

```
src/emails/
├── layout.tsx                    # Shared layout: HeyDPE logo, dark theme, footer
├── welcome.tsx                   # Welcome to HeyDPE
├── subscription-confirmed.tsx    # Subscription started
├── subscription-cancelled.tsx    # Subscription cancelled
└── payment-failed.tsx            # Payment failed, update billing
```

Each template uses `@react-email/components` (Container, Heading, Text, Button, etc.) styled to match the cockpit design system (dark background, amber accents, monospace fonts).

---

## OAuth Configuration

### Google (Already Working)

No changes needed. Configured in Supabase Dashboard.

### Apple Sign-In

**External setup required (human tasks):**

1. Apple Developer Portal → Identifiers → Create App ID with "Sign in with Apple" capability
2. Apple Developer Portal → Identifiers → Create Services ID (`com.heydpe.web`)
3. Configure web domain: `heydpe.com`
4. Configure redirect URL: `https://pvuiwwqsumoqjepukjhz.supabase.co/auth/v1/callback`
5. Apple Developer Portal → Keys → Create signing key for Sign in with Apple
6. Download `.p8` file (only available once)
7. Note: Team ID, Key ID, Services ID

**Supabase Dashboard:**

Authentication → Providers → Apple:
- Client ID: Services ID from step 2
- Secret Key: Contents of `.p8` file
- Team ID: 10-character Apple Team ID
- Key ID: From step 5

**Maintenance:** Apple signing keys must be rotated every 6 months.

### Microsoft (Azure Entra ID)

**External setup required (human tasks):**

1. Azure Portal → Microsoft Entra ID → App registrations → New registration
2. Name: "HeyDPE"
3. Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
4. Redirect URI (Web): `https://pvuiwwqsumoqjepukjhz.supabase.co/auth/v1/callback`
5. Copy Application (client) ID
6. Certificates & secrets → New client secret → Copy value + note expiration

**Supabase Dashboard:**

Authentication → Providers → Azure:
- Client ID: Application (client) ID from step 5
- Client Secret: Secret value from step 6
- Tenant URL: `https://login.microsoftonline.com/common`

**Maintenance:** Azure client secrets expire (configurable: 6 months to 2 years). Calendar reminder needed.

---

## Database Schema

### New Table: support_tickets

```sql
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_email_id TEXT UNIQUE,          -- Resend email ID for idempotency
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_address TEXT NOT NULL,             -- support@, feedback@, etc.
  subject TEXT NOT NULL,
  body_text TEXT,
  body_html TEXT,
  ticket_type TEXT DEFAULT 'support',   -- support, feedback
  status TEXT DEFAULT 'open',           -- open, in_progress, resolved, closed
  priority TEXT DEFAULT 'normal',       -- low, normal, high, urgent
  assigned_to UUID REFERENCES admin_users(user_id),
  user_id UUID REFERENCES auth.users(id),  -- matched by from_email if user exists
  reply_count INT DEFAULT 0,
  last_reply_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,              -- 'inbound' or 'outbound'
  from_email TEXT NOT NULL,
  body_text TEXT,
  body_html TEXT,
  resend_email_id TEXT,                 -- Track sent replies
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### RLS Policies

- `support_tickets`: Admin read/write only (via `admin_users` check)
- `ticket_replies`: Admin read/write only
- Service role used by webhook handler to insert tickets

### Email Forwarding Config

Store forwarding rules in code (not database) since there are only 2-3 rules:

```typescript
const FORWARDING_RULES: Record<string, string> = {
  'pd@heydpe.com': 'pd@personal-email.com',  // From env var
};
const CATCH_ALL_FORWARD = 'pd@personal-email.com';  // From env var
const TICKET_ADDRESSES = ['support@heydpe.com', 'feedback@heydpe.com'];
```

**New env var:** `EMAIL_FORWARD_TO` — Personal email address for forwarding.

---

## Integration Points

### Auth Callback (Welcome Email)

In `src/app/auth/callback/route.ts`:

```typescript
// After ensureProfile():
const isNewUser = /* check if profile was just created */;
if (isNewUser) {
  const email = user.email;
  const name = user.user_metadata?.full_name || user.user_metadata?.name;
  void sendWelcomeEmail(email!, name);  // Fire-and-forget
}
```

Detection: `ensureProfile()` returns a boolean indicating whether a new profile was created.

### Stripe Webhook (Subscription Emails)

In `src/app/api/stripe/webhook/route.ts`:

```typescript
// After checkout.session.completed:
void sendSubscriptionConfirmed(customerEmail, plan);

// After customer.subscription.deleted:
void sendSubscriptionCancelled(customerEmail);

// After invoice.payment_failed:
void sendPaymentFailed(customerEmail);
```

### Inbound Webhook Security

- Verify Resend webhook signature using `svix` library (Resend uses Svix for webhook delivery)
- New env var: `RESEND_WEBHOOK_SECRET` — From Resend dashboard webhook configuration
- Reject requests with invalid signatures (return 401)

---

## File Structure

```
src/
├── lib/
│   └── email.ts                              # Resend client + send functions
├── emails/                                   # React Email templates
│   ├── layout.tsx                            # Shared email layout
│   ├── welcome.tsx
│   ├── subscription-confirmed.tsx
│   ├── subscription-cancelled.tsx
│   └── payment-failed.tsx
├── app/
│   ├── api/
│   │   └── webhooks/
│   │       └── resend-inbound/
│   │           └── route.ts                  # Inbound email webhook
│   └── (admin)/
│       └── admin/
│           └── support/
│               └── page.tsx                  # Support tickets admin UI

supabase/migrations/
└── 20260218_support_tickets.sql              # Tables + RLS + indexes
```

## New Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `resend` | Email sending API client | ~50KB |
| `@react-email/components` | Email template components | ~200KB |
| `svix` | Webhook signature verification | ~30KB |

## New Environment Variables

| Variable | Purpose | Stored In |
|----------|---------|-----------|
| `RESEND_WEBHOOK_SECRET` | Verify inbound webhook signatures | Vercel env |
| `EMAIL_FORWARD_TO` | Personal email for forwarding pd@heydpe.com | Vercel env |

## External Configuration (Human Tasks)

| Task | Where | When |
|------|-------|------|
| Create Apple Services ID + signing key | Apple Developer Portal | Before Apple OAuth works |
| Configure Apple provider in Supabase | Supabase Dashboard | After Apple setup |
| Register Azure app + create client secret | Azure Portal | Before Microsoft OAuth works |
| Configure Azure provider in Supabase | Supabase Dashboard | After Azure setup |
| Add inbound webhook URL in Resend | Resend Dashboard | Before inbound email works |
| Copy webhook signing secret | Resend Dashboard → Vercel | After webhook created |
| Set `EMAIL_FORWARD_TO` in Vercel | Vercel Dashboard | Before forwarding works |

## Maintenance Calendar

| Task | Frequency | Owner |
|------|-----------|-------|
| Rotate Apple signing key | Every 6 months | Admin |
| Rotate Azure client secret | Before expiration (set reminder) | Admin |
| Review DMARC reports | Monthly | Admin |
| Tighten DMARC to `p=quarantine` | After 30 days of monitoring | Admin |

---

*Created: 2026-02-18*
