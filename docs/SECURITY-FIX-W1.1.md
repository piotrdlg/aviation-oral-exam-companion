# Security Fix W1.1: RPC Authorization & Search Path Hardening

**Date**: 2026-06-10  
**Severity**: Critical  
**Status**: Implemented  
**Affected**: Production RPC endpoints (exam performance data)

## Summary

Closed a critical cross-user data exposure vulnerability in three `SECURITY DEFINER` PostgreSQL functions. Any authenticated user could call these RPCs with another user's ID/session ID and receive their full exam performance data.

## Vulnerable Functions

1. **`get_element_scores(p_user_id, p_rating)`**
   - Location: `supabase/migrations/20260214000006_element_attempts.sql:70` and `20260218200001:67`
   - Issue: Trusted caller-supplied `p_user_id` parameter without verifying `auth.uid()` ownership
   - Impact: Any authenticated user could read any other user's per-element ACS exam scores

2. **`get_session_element_scores(p_session_id)`**
   - Location: `supabase/migrations/20260218200001:13`
   - Issue: Trusted `p_session_id` parameter without ownership check
   - Impact: Any authenticated user could read any session's element scores if they knew the session UUID

3. **`get_uncovered_acs_tasks(p_session_id)`**
   - Location: `supabase/migrations/20260214000001:430`
   - Issue: Trusted `p_session_id` parameter without ownership check
   - Impact: Any authenticated user could discover which ACS tasks another user hadn't covered

## Root Cause

`SECURITY DEFINER` functions execute with the privileges of the function owner (postgres), bypassing Row-Level Security (RLS). The functions accepted user-supplied IDs but never validated them against `auth.uid()`.

PostgREST exposes all functions to authenticated users by default (no `REVOKE EXECUTE FROM authenticated` was in place), making these endpoints directly callable.

## Fix Applied

### 1. Authorization Checks

Added explicit ownership checks in each function:

```sql
-- For get_element_scores:
IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'forbidden: cannot access another user''s element scores';
END IF;

-- For session-scoped RPCs:
IF auth.uid() IS NOT NULL THEN
  IF NOT EXISTS (
    SELECT 1 FROM exam_sessions WHERE id = p_session_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'forbidden: cannot access another user''s session';
  END IF;
END IF;
```

**Service Role Bypass:**
- When `auth.uid() IS NULL` (service role), checks are skipped
- Allows server-side calls from instructor insights, admin dashboards
- Service role only available with `SUPABASE_SERVICE_ROLE_KEY` (never in client code)

### 2. Search Path Hardening (D1 Fix)

Added `SET search_path = public` to all `SECURITY DEFINER` functions:

```sql
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

Prevents object-shadowing attacks where a malicious schema in search_path could intercept function calls.

**Functions hardened:**
- `get_element_scores()`
- `get_session_element_scores()`
- `get_uncovered_acs_tasks()`
- `hybrid_search()`
- `get_related_concepts()`

## Migration

**File**: `supabase/migrations/20260610000001_secure_rpc_auth.sql`

- Drops and recreates all affected functions with authorization checks
- Migration is read-safe: only affects authorization, not data structure
- Existing paying users' data remains unchanged; only access control is enforced

## Testing

**Test Script**: `scripts/audit/test-rpc-authorization.ts`

Verifies:
1. Cross-user access with authenticated JWT returns `forbidden` exception
2. Service role access still works (for instructor insights)
3. RPC returns empty or exception, never another user's data

Run with:
```bash
npx tsx scripts/audit/test-rpc-authorization.ts
```

## Impact Assessment

### ✅ Safe for Production

- **Callers checked**: Verified all 4 app callers pass correct credentials
  - `src/app/api/session/route.ts` uses `user.id` (line 270, 301) ✓
  - `src/lib/exam-planner.ts` uses service role for correct user (line 301) ✓
  - Scripts call with service role ✓

- **Zero data loss**: Authorization-only change
- **Backward compatible**: Legitimate callers unchanged; illegitimate calls fail explicitly

### ⚠️ Breaking Change

Direct REST API calls with cross-user parameters now return `403 Forbidden`:

```
// Before (BROKEN):
GET /rest/v1/rpc/get_element_scores?p_user_id=<OTHER_USER_ID> → 200 + data leak

// After (FIXED):
GET /rest/v1/rpc/get_element_scores?p_user_id=<OTHER_USER_ID> → 403 forbidden
```

No legitimate client code does this, as all calls go through the `/api/session` route handler.

## Deployment Notes

1. Apply migration to production:
   ```bash
   supabase migration up
   ```

2. Verify test passes:
   ```bash
   npm run audit:rpc-authorization  # (after adding script to package.json)
   ```

3. Monitor production logs for errors (should see 0):
   - Legitimate calls continue
   - Suspicious calls now fail with "forbidden" message

4. No data backfill or cleanup needed

## References

- Security Review 06: Critical findings C1, D1
- Supabase security best practices: https://supabase.com/docs/guides/database/postgres/row-level-security
- PostgreSQL SECURITY DEFINER: https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY

## Related Issues

- Closes C1 (cross-user RPC leak) from Review 06
- Closes D1 (missing search_path hardening) from Review 06
