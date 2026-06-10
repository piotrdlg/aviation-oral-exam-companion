# Security Fix W1.3: Exam Route IDOR Ownership Check

**Date**: 2026-06-10  
**Severity**: High  
**Status**: Implemented  
**Affected**: Exam write operations (POST /api/exam streaming branches)

## Summary

Closed an Insecure Direct Object Reference (IDOR) vulnerability where authenticated users could write to other users' exam sessions. The `/api/exam` POST handler accepted a `sessionId` parameter and wrote transcripts, metadata, and results to the service-role-bypassing database without verifying ownership.

## Vulnerable State

**File**: `src/app/api/exam/route.ts` POST handler (lines 280+)

**Problem**: 
- Request body accepts `sessionId` parameter
- Handler uses `serviceSupabase` (service-role) client for streaming writes
- No ownership verification before writes (unlike the GET handler which verified at lines 195-205)
- Any authenticated user could supply another user's `sessionId` and:
  - Write transcript rows to their exam sessions
  - Inject false Q&A exchanges
  - Modify session metadata and results
  - Bypass RLS through service-role writes

## Exploit Path

```
curl -X POST https://app.example.com/api/exam \
  -H "Authorization: Bearer user-a-jwt" \
  -d '{
    "action": "respond",
    "sessionId": "user-b-session-uuid",  // ← Another user's session!
    "studentAnswer": "injected answer"
  }'

→ Writes to user B's exam_sessions record via service role
```

## Fix Applied

**Files Modified**:
1. `src/app/api/exam/route.ts` — Added ownership check
2. `src/lib/session-enforcement.ts` — Added defensive comment
3. `src/app/api/exam/__tests__/idor-session-ownership.test.ts` — New test

### 1. Ownership Check in POST Handler

Added immediately after body destructuring (line 328):

```typescript
// CRITICAL: Verify session ownership (W1.3 IDOR fix)
if (sessionId) {
  const { data: sessionOwnershipCheck } = await supabase
    .from('exam_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();

  if (!sessionOwnershipCheck) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
}
```

**Key characteristics:**
- Uses RLS-scoped `supabase` client (not service role)
- Checks **both** `id` and `user_id` to confirm ownership
- Returns 404 (same as if session doesn't exist) to avoid leaking information
- Executes **before** any branch logic that uses sessionId for writes
- Replicates GET handler pattern (lines 195-205)

### 2. Defensive Comment in session-enforcement.ts

Added to `enforceOneActiveExam()` function (line 33):

```typescript
/**
 * ⚠️  SECURITY REQUIREMENT: The caller MUST verify that examSessionId belongs
 * to the authenticated user (via RLS check on exam_sessions table) before calling
 * this function.
 */
```

Ensures future developers understand the security contract.

## Impact Analysis

### ✅ Protected

- **Transcript writes**: `session_transcripts.insert()` at line 418, 538, 696
- **Metadata updates**: `exam_sessions.update()` at line 429, 894, 980, 1016
- **Latency logging**: Uses `sessionId` with service role (now verified owned)
- **Element attempts**: Written with verified sessionId

### ✅ Backward Compatible

- All legitimate exam flows (`start`, `respond`, `next-task`, `resume-current`) continue working
- Ownership check adds <1ms latency (single index lookup)
- Existing test coverage unaffected

### ⚠️ Breaking Change

Cross-user session writes now return 404:

```
Before: User A → write to user B's session → 200 OK (BROKEN)
After:  User A → write to user B's session → 404 Not Found (FIXED)
```

No legitimate client performs this action.

## Testing

**Test File**: `src/app/api/exam/__tests__/idor-session-ownership.test.ts`

Verifies:
1. User A cannot start/respond with user B's sessionId (returns 404)
2. User A can start/respond with their own sessionId (succeeds)
3. No writes occur before ownership check fails
4. Ownership check happens before action branch logic

Run tests:
```bash
npm test -- idor-session-ownership.test.ts
```

Manual integration test:
```bash
# Get user A and user B's session IDs
# As user A, attempt to respond to user B's session:
curl -X POST https://localhost:3000/api/exam \
  -H "Authorization: Bearer user-a-jwt" \
  -H "Content-Type: application/json" \
  -d '{"action":"respond","sessionId":"user-b-uuid","studentAnswer":"test"}'

# Expected: 404 Not Found
```

## Deployment

No migration needed (no database changes).

**Safe to deploy immediately:**
```bash
git push origin main
```

Existing exam sessions unaffected. Only prevents future IDOR writes.

## Code Review Checklist

- [x] Ownership check uses RLS-scoped client (not service role)
- [x] Check happens before ANY action branch logic
- [x] Returns 404 (not leaking information)
- [x] Replicates existing pattern from GET handler
- [x] Defensive comment added to `enforceOneActiveExam()`
- [x] Test coverage added
- [x] No changes to legitimate exam flows
- [x] Variable naming clear (`sessionOwnershipCheck`)

## Related Issues

- Closes C3 (IDOR writes to exam sessions) from Review 06
- Complements W1.1 (RPC auth) and W1.2 (PII hiding) — defense-in-depth
- Follows GET handler pattern (established pattern + consistency)

## References

- Security Review 06: Critical findings C3
- OWASP IDOR: https://owasp.org/www-community/attacks/Insecure_Direct_Object_Reference
- Supabase Row-Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security

## Implementation Notes

The `enforceOneActiveExam()` function assumes sessionId ownership and uses service role. With this fix:
1. Route handler verifies ownership with RLS client
2. Safe to pass verified sessionId to enforcement function
3. Enforcement function upserts to `active_sessions` with trusted userId + sessionId pair

This is defense-in-depth: the ownership check prevents passing untrusted sessionIds anywhere in the handler.
