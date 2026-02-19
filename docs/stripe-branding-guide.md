# Stripe Checkout Branding Guide — HeyDPE

## Quick Reference: HeyDPE Color Palette

| Role            | Hex       | Usage                          |
|-----------------|-----------|--------------------------------|
| Primary accent  | `#f5a623` | Buttons, highlights, brand     |
| Secondary       | `#00d4ff` | Links, focus rings, status     |
| Background      | `#080c12` | Page background                |
| Panel           | `#0d1117` | Card/panel surfaces            |
| Border          | `#1c2333` | Borders, dividers              |
| Text primary    | `#c9d1d9` | Main body text                 |
| Text muted      | `#6b7280` | Secondary text                 |
| Success         | `#00ff41` | Satisfactory indicators        |
| Error           | `#ff3b30` | Error states                   |

Fonts: **JetBrains Mono** (headings/mono), **IBM Plex Sans** (body)

---

## Part 1: Stripe Dashboard Settings

Go to **[Stripe Dashboard](https://dashboard.stripe.com) > Settings > Branding**

### 1.1 Logo

Upload: `public/logo-heydpe-800.png` (800 x 200px)

This appears at the top-left of the Checkout page. The dark-background version
with amber text on `#080c12` works because Stripe Checkout uses a white or light
background — use the **dark text on transparent** version instead if Stripe's
preview shows poor contrast:

- Dark BG version: `public/logo-heydpe-800.png` (for dark Stripe themes)
- Alternate: re-export `public/logo-heydpe-on-white.svg` as PNG if needed

### 1.2 Icon

Upload: `public/icon-heydpe-512.png` (512 x 512px)

The square "H" monogram icon. Used as:
- Favicon on the checkout page tab
- Small brand indicator on mobile checkout
- Customer Portal favicon

### 1.3 Brand Color

Set to: **`#f5a623`** (HeyDPE amber)

This controls:
- Pay/Subscribe button background
- Link colors
- Loading indicators
- Selected payment method highlight

### 1.4 Accent Color

Set to: **`#080c12`** (HeyDPE background dark)

This is used for:
- Button text color (text on top of brand color)
- Focus ring contrast

Using dark `#080c12` ensures high contrast against the amber `#f5a623` buttons
(same as the site's amber buttons with dark text).

---

## Part 2: Code-Level Checkout Customizations

These are set in `src/app/api/stripe/checkout/route.ts` when creating the
checkout session.

### 2.1 Custom Text (Trust Signals)

Add `custom_text` to reinforce the 7-day free trial and build trust:

```typescript
const session = await stripe.checkout.sessions.create({
  // ... existing config ...
  custom_text: {
    submit: {
      message: 'Start your 7-day free trial. Cancel anytime — no questions asked.',
    },
    after_submit: {
      message: 'Welcome to HeyDPE! Your practice sessions are ready.',
    },
  },
});
```

### 2.2 Terms of Service (Optional)

If you want to require TOS acceptance before checkout:

```typescript
const session = await stripe.checkout.sessions.create({
  // ... existing config ...
  consent_collection: {
    terms_of_service: 'required',
  },
  custom_text: {
    terms_of_service_acceptance: {
      message: 'I agree to the HeyDPE [Terms of Service](https://heydpe.com/terms).',
    },
  },
});
```

### 2.3 Tax ID Collection (Optional, for international)

```typescript
tax_id_collection: { enabled: true },
```

---

## Part 3: Customer Portal Branding

Go to **Stripe Dashboard > Settings > Customer Portal**

The portal (linked from Settings page) should match:

1. **Business name**: `HeyDPE`
2. **Logo**: Same `logo-heydpe-800.png`
3. **Primary color**: `#f5a623`
4. **Heading**: Custom heading like "Manage Your HeyDPE Subscription"
5. **Enable**: Invoice history, subscription cancellation, payment method updates

---

## Part 4: Email Receipt Branding

Go to **Stripe Dashboard > Settings > Emails**

1. **Logo**: Upload `logo-heydpe-800.png`
2. **Brand color**: `#f5a623`
3. **Support email**: `pd@imagineflying.com`
4. **Public business name**: `HeyDPE by Imagine Flying LLC`
5. **Enable**: Successful payment receipts, upcoming renewal reminders

---

## Part 5: Recommended Dashboard Settings Checklist

- [ ] **Settings > Branding > Logo** — Upload `logo-heydpe-800.png`
- [ ] **Settings > Branding > Icon** — Upload `icon-heydpe-512.png`
- [ ] **Settings > Branding > Brand color** — Set `#f5a623`
- [ ] **Settings > Branding > Accent color** — Set `#080c12`
- [ ] **Settings > Public details > Business name** — `HeyDPE`
- [ ] **Settings > Public details > Support phone/email** — `pd@imagineflying.com`
- [ ] **Settings > Public details > Privacy policy URL** — `https://heydpe.com/privacy`
- [ ] **Settings > Public details > Terms of service URL** — `https://heydpe.com/terms`
- [ ] **Settings > Emails > Logo** — Upload same logo
- [ ] **Settings > Emails > Brand color** — `#f5a623`
- [ ] **Settings > Customer Portal > Business name** — `HeyDPE`
- [ ] **Settings > Customer Portal > Heading** — "Manage Your HeyDPE Subscription"

---

## Asset Files Created

| File | Size | Purpose |
|------|------|---------|
| `public/logo-heydpe.svg` | 400x100 | Full logo, dark bg, scalable |
| `public/logo-heydpe-on-white.svg` | 400x100 | Full logo, transparent bg |
| `public/logo-heydpe-800.png` | 800x200 | Stripe Dashboard upload |
| `public/icon-heydpe.svg` | 512x512 | Square icon, scalable |
| `public/icon-heydpe-512.png` | 512x512 | Stripe icon upload |
| `public/icon-heydpe-128.png` | 128x128 | Minimum size icon |
