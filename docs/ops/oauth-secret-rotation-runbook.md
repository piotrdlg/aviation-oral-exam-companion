# OAuth Secret Rotation Runbook — HeyDPE

Keeps **Apple** and **Microsoft (Entra ID)** social login alive. Google needs no
secret rotation. Supabase brokers all three; secrets are pasted in
**Supabase Dashboard → Authentication → Providers**.

> **Hard rule for any automation/Claude:** never type or paste the **secret value**
> itself (JWT / client-secret Value) into a field. Automation may navigate, click,
> read expiry dates, and verify — but a **human pastes the actual secret**. The
> secret is shown by Azure/your terminal once; treat it like a password.

| Provider | What expires | Max life | Cadence | Breaks with |
|---|---|---|---|---|
| Apple | `client_secret` JWT (signed by `.p8`) | 6 months | rotate every ~5 mo | `invalid_client` |
| Microsoft | Entra client secret | 24 mo (pick 12) | rotate ~annually | `AADSTS7000222` |
| Google | nothing | — | — | — |

Identifiers (stable, don't expire): Apple Services ID `com.heydpe.auth`, Team ID
`45K5W4N8DG`; Azure app (client) ID `0fd093c3-6acc-47d9-8e4b-465ea987cf9d`,
tenant `/common`. Provider callback (already registered everywhere):
`https://auth.heydpe.com/auth/v1/callback`.

---

## A. Apple rotation (every ~5 months)

Apple's JWT can only be minted locally from the `.p8` key — it cannot be done in
a browser, so there is no Claude-in-Chrome path for the *generation* step.

1. **Generate the JWT** — run this exact command (path + Key ID filled in; update the path if you move the `.p8`):
   ```bash
   cd ~/claude-projects/aviation-oral-exam-companion && APPLE_KEY_ID=DU38HHN7KP APPLE_P8_PATH="/Users/piotrdlugiewicz/Downloads/AuthKey_DU38HHN7KP.p8" node scripts/ops/generate-apple-client-secret.mjs | pbcopy
   ```
   The new JWT is now on your clipboard; note the printed **Expires** date.
2. **Paste into Supabase** (human pastes; Claude-in-Chrome may navigate only):
   - Go to `https://supabase.com/dashboard/project/pvuiwwqsumoqjepukjhz/auth/providers`
   - Expand **Apple**.
   - Replace **"Secret Key (for OAuth)"** with the clipboard JWT. Leave **Client IDs**
     = `com.heydpe.auth`.
   - **Save**.
3. **Verify** (no credentials needed): open in incognito —
   `https://appleid.apple.com/auth/authorize?client_id=com.heydpe.auth&redirect_uri=https%3A%2F%2Fauth.heydpe.com%2Fauth%2Fv1%2Fcallback&response_mode=form_post&response_type=code&scope=email+name&state=verify`
   → the Apple sign-in page must render (not `invalid_client`, not `invalid_request`).
4. **Record + re-arm:** update `docs/ops/oauth-secret-expiry.json` (`apple.expires`,
   `apple.rotated`) and tell Claude "re-arm the OAuth watchdog" — it points the daily
   reminder routine at the new expiry (~10s). Commit the JSON as the human record.

---

## B. Microsoft (Entra ID) rotation (~annually)

Use the **zero-downtime** pattern: add the new secret while the old is still live,
swap Supabase, verify, then delete the old.

### Human path
1. **entra.microsoft.com** → **App registrations** → search `0fd093c3-6acc-47d9-8e4b-465ea987cf9d` → open.
2. **Manage → Certificates & secrets → Client secrets → + New client secret**.
   - Description: `supabase-YYYY-MM`. Expires: **12 months** (recommended).
   - **Add**, then immediately **copy the `Value`** (shown once). Note the **Expires** date.
3. **Supabase** → `…/auth/providers` → **Azure** → replace **Client Secret** with the copied Value → **Save**. (Leave Client ID / Tenant URL unchanged.)
4. **Verify**: incognito → heydpe.com/login → Continue with Microsoft → you reach the
   account/consent screen (not `AADSTS7000222`/`50011`). Completing a login → `/home` confirms.
5. **Delete the OLD secret** in Entra (Certificates & secrets) once the new one works.
6. **Record + re-arm:** update `docs/ops/oauth-secret-expiry.json` (`azure.expires`,
   `azure.rotated`) and tell Claude "re-arm the OAuth watchdog". Commit the JSON.

### Claude-in-Chrome path (assist; human still copies/pastes the secret Value)
- Claude navigates Entra to the app's **Certificates & secrets**, clicks **New client
  secret**, sets description + 12-month expiry, clicks **Add**. **STOP** — the human
  copies the `Value` (Claude must not read/transcribe it).
- Claude opens the Supabase Azure provider page and focuses the **Client Secret** field.
  **STOP** — the human pastes, then Claude clicks **Save** and runs the verify step.

---

## C. After any rotation — re-anchor reminders

The daily reminder watchdog (cloud routine) holds the current expiry dates. After a
rotation: (1) update `docs/ops/oauth-secret-expiry.json` to the new dates and commit it
as the record; (2) tell Claude "re-arm the OAuth watchdog" — Claude updates the routine's
embedded dates so it reminds you on the next cycle. That's the only manual touch per cycle.
