# Security Fix W1.2: Instructor PII Exposure

**Date**: 2026-06-10  
**Severity**: Critical  
**Status**: Implemented  
**Affected**: Public instructor discovery (anon key exposure)

## Summary

Closed a critical exposure of instructor personally identifiable information (PII). The RLS policy "Public can read approved instructor profiles by slug" granted anonymous users SELECT access to all columns of `instructor_profiles`, including FAA certificate numbers, admin notes, and verification data.

## Vulnerable State

**File**: `supabase/migrations/20260306000006_instructor_referrals.sql:21-24`

```sql
CREATE POLICY "Public can read approved instructor profiles by slug"
  ON instructor_profiles FOR SELECT
  TO anon, authenticated
  USING (status = 'approved' AND slug IS NOT NULL);
```

**Problem**: RLS policies are row-level filters, not column filters. This policy allowed ANY authenticated or anonymous user to read the entire `instructor_profiles` row, including:

- `certificate_number` (FAA license number - sensitive PII)
- `admin_notes` (internal verification notes)
- `verification_data` (application verification details)
- `rejection_reason` (PII from applications)
- `email` (instructor contact info)
- `metadata` (could contain sensitive data)

## Exploit Path

```bash
# As anonymous user with anon key:
curl -H "apikey: $SUPABASE_ANON_KEY" \
  'https://<project>.supabase.co/rest/v1/instructor_profiles?status=eq.approved&slug=is.not.null&select=certificate_number,admin_notes'

# Returns all approved instructor certificate numbers and admin notes
```

## Fix Applied

**Migration**: `supabase/migrations/20260610000002_secure_instructor_pii.sql`

### 1. Drop Vulnerable Policy

Removed the blanket anon/authenticated SELECT policy on the table.

```sql
DROP POLICY "Public can read approved instructor profiles by slug"
  ON instructor_profiles;
```

### 2. Create Restricted View

Created a view that exposes only display-safe columns for approved instructors:

```sql
CREATE OR REPLACE VIEW public_instructor_profiles AS
  SELECT
    id,
    first_name,
    last_name,
    certificate_type,
    bio,
    slug,
    referral_code,
    created_at,
    updated_at
  FROM instructor_profiles
  WHERE status = 'approved'
    AND slug IS NOT NULL;
```

**Safe columns only:**
- `id` — needed for linking to users
- `first_name`, `last_name` — display names
- `certificate_type` — credential type (CFI, CFII, MEI, etc.) - NOT the number
- `bio` — public instructor bio
- `slug` — public URL slug
- `referral_code` — public referral link
- `created_at`, `updated_at` — metadata

**Excluded (sensitive):**
- ❌ `certificate_number` — FAA license number
- ❌ `admin_notes` — internal verification notes
- ❌ `verification_data` — application verification details
- ❌ `rejection_reason` — application rejection notes
- ❌ `email` — instructor contact info (in user table instead)
- ❌ `suspension_reason` — internal action notes

### 3. Grant View Access

```sql
GRANT SELECT ON public_instructor_profiles TO anon, authenticated;
```

Anonymous users can now read the view (safe columns only), but the underlying table remains protected.

## Existing Code Impact

### Unaffected (Safe)

✅ **API Route** (`src/app/api/referral/lookup/route.ts`)
- Uses service role client
- Explicitly selects only safe columns via `lookupBySlug()` and `lookupByReferralCode()`
- No code changes needed

✅ **Instructor modules** (`src/lib/instructor-*.ts`)
- Admin routes use service role
- Own-profile access uses RLS ownership check
- No code changes needed

### Maintained Access Control

**Instructors' own profiles**: The RLS policy "Users can read own instructor profile" remains intact
- Instructors can still read their full profile via `user_id = auth.uid()`

**Admin access**: Admin routes continue using service role with full table access

**Public access**: Now restricted to view (safe columns only)

## Testing

**Test Script**: `scripts/audit/test-instructor-pii-exposure.ts`

Verifies:
1. Anonymous key cannot read sensitive columns from table
2. Anonymous key CAN read view (safe columns)
3. Service role still has full table access
4. No error messages leak data

Run with:
```bash
npx tsx scripts/audit/test-instructor-pii-exposure.ts
```

Expected results:
```
✅ PASS: Direct table access denied
✅ PASS: View accessible (safe columns only)
✅ PASS: Service role has full access
```

## Deployment

```bash
supabase db push  # Apply migration to production
```

**Zero-risk deployment:**
- View-based approach is purely additive
- No existing data modified
- No schema changes to main table
- RLS policies remain intact (only anon policy removed)
- Admin and own-profile access unchanged

## Verification

After deployment, verify:

```bash
# As anonymous user — should return nothing or error
curl -H "apikey: $ANON_KEY" \
  'https://<project>.supabase.co/rest/v1/instructor_profiles?select=certificate_number'
# Expected: 403 Forbidden or policy-denied

# As anonymous user — should work (view)
curl -H "apikey: $ANON_KEY" \
  'https://<project>.supabase.co/rest/v1/public_instructor_profiles?select=first_name,slug'
# Expected: 200 OK with safe data

# As authenticated user — own profile still works
curl -H "apikey: $ANON_KEY" -H "Authorization: Bearer $JWT" \
  'https://<project>.supabase.co/rest/v1/instructor_profiles?select=certificate_number'
# Expected: 200 OK (own data) or 403 (other's data)
```

## Related Issues

- Closes C2 (anonymous PII exposure) from Review 06
- Complements W1.1 (RPC authorization) — different attack vector, same threat model

## References

- Security Review 06: Critical findings C2
- Supabase RLS best practices: https://supabase.com/docs/guides/database/postgres/row-level-security
- Column-level security in PostgreSQL: Views + RLS provide defense-in-depth
