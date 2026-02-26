# Multi-Exam Resume Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to see and manage all their open (active/paused) exams, not just the most recent one.

**Architecture:** Add a new API action that returns all resumable sessions (removing the `.limit(1)`). The frontend keeps showing the most recent exam in the existing resume card, but adds a "+ N more open exams" link below it. Clicking opens a modal listing all open exams with Continue/Grade/Discard actions per row. The modal reuses existing `resumeSession()`, `gradeResumableSession()`, and discard logic.

**Tech Stack:** Next.js App Router API route, React state + modal, Tailwind CSS, Vitest

---

### Task 1: Add `get-all-resumable` API action

**Files:**
- Modify: `src/app/api/session/route.ts:251-266`
- Modify: `src/lib/__tests__/session-policy.test.ts` (add GET handler import + test)

**Context:** The existing `get-resumable` action (GET) queries `exam_sessions` for `status IN ('active', 'paused')`, ordered by most recent, limited to 1. We need a sibling action that returns all of them. We also need to import the `GET` handler in the test file since all existing tests only cover `POST`.

**Step 1: Add API action**

In `src/app/api/session/route.ts`, right after the `get-resumable` block (after line 266), add:

```typescript
  // Get ALL resumable sessions (active or paused)
  if (action === 'get-all-resumable') {
    const { data, error } = await supabase
      .from('exam_sessions')
      .select('id, rating, status, started_at, exchange_count, study_mode, difficulty_preference, aircraft_class, selected_areas, selected_tasks, metadata, acs_tasks_covered')
      .eq('user_id', user.id)
      .in('status', ['active', 'paused'])
      .order('started_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessions: data || [] });
  }
```

Note: no `.limit()` — returns all open exams.

**Step 2: Add test for the new action**

In `src/lib/__tests__/session-policy.test.ts`:

First, update the import at line 33 to also import `GET`:

```typescript
import { POST, GET } from '@/app/api/session/route';
```

Add a helper for GET requests (near the existing `postReq` helper around line 59):

```typescript
function getReq(params: Record<string, string>) {
  const url = new URL('http://localhost/api/session');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: 'GET' }) as any;
}
```

Add a new describe block at the end of the file (before the closing):

```typescript
// ================================================================
// GET — get-all-resumable
// ================================================================
describe('GET — get-all-resumable', () => {
  it('returns 401 when not authenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(getReq({ action: 'get-all-resumable' }));
    expect(res.status).toBe(401);
  });

  it('returns all active/paused sessions', async () => {
    const sessions = [
      { id: 's1', rating: 'private', status: 'active', started_at: '2026-02-19T10:00:00Z' },
      { id: 's2', rating: 'instrument', status: 'paused', started_at: '2026-02-18T10:00:00Z' },
    ];
    mocks.userFrom.mockReturnValueOnce(q({ data: sessions }));

    const res = await GET(getReq({ action: 'get-all-resumable' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions[0].id).toBe('s1');
    expect(body.sessions[1].id).toBe('s2');
  });

  it('returns empty array when no open exams', async () => {
    mocks.userFrom.mockReturnValueOnce(q({ data: [] }));

    const res = await GET(getReq({ action: 'get-all-resumable' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toEqual([]);
  });
});
```

**Step 3: Run tests**

Run: `npx vitest run src/lib/__tests__/session-policy.test.ts`
Expected: All tests pass (existing 23 + 3 new = 26)

**Step 4: Commit**

```bash
git add src/app/api/session/route.ts src/lib/__tests__/session-policy.test.ts
git commit -m "feat: add get-all-resumable API action for multi-exam resume"
```

---

### Task 2: Fetch all resumable sessions on mount + add state

**Files:**
- Modify: `src/app/(dashboard)/practice/page.tsx:118-127` (state), `187-201` (useEffect)

**Context:** Currently `resumableSession` is a single object fetched via `get-resumable`. We need a second piece of state — `allResumableSessions` (array) — fetched from the new `get-all-resumable` endpoint. The existing `resumableSession` stays as the "featured" (most recent) one. We also need state for the modal toggle.

**Step 1: Add state variables**

After line 131 (the `gradingInProgress` state), add:

```typescript
const [allResumableSessions, setAllResumableSessions] = useState<NonNullable<typeof resumableSession>[]>([]);
const [showOpenExamsModal, setShowOpenExamsModal] = useState(false);
```

**Step 2: Update the mount useEffect**

Replace the existing `get-resumable` useEffect (lines 187-201) with a fetch to `get-all-resumable` that sets both states:

```typescript
  // Check for resumable sessions on mount
  useEffect(() => {
    fetch('/api/session?action=get-all-resumable')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.sessions?.length) {
          const valid = data.sessions.filter((s: Record<string, unknown>) => {
            const meta = s.metadata as Record<string, unknown> | null;
            return meta?.plannerState && meta?.sessionConfig;
          });
          setAllResumableSessions(valid);
          if (valid.length > 0) {
            setResumableSession(valid[0]); // most recent
          }
        }
      })
      .catch(() => {});
  }, []);
```

**Step 3: Update refreshes after pause**

In the `pauseSession()` function (around line 908), update the refresh logic to also fetch all sessions. Find the block that calls `get-resumable` and replace it:

```typescript
    // Refresh resumable sessions so the resume card appears
    try {
      const res = await fetch('/api/session?action=get-all-resumable');
      if (res.ok) {
        const data = await res.json();
        const valid = (data.sessions || []).filter((s: Record<string, unknown>) => {
          const meta = s.metadata as Record<string, unknown> | null;
          return meta?.plannerState && meta?.sessionConfig;
        });
        setAllResumableSessions(valid);
        if (valid.length > 0) setResumableSession(valid[0]);
      }
    } catch { /* ignore */ }
```

**Step 4: Update `startSession` auto-complete logic**

In `startSession()` (line 404-413), the current code auto-completes the single `resumableSession` when starting a new exam. This should remain as-is — it only completes the most recent one. Other open exams stay open for the user to manage via the modal.

**Step 5: Run type-check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 6: Commit**

```bash
git add "src/app/(dashboard)/practice/page.tsx"
git commit -m "feat: fetch all resumable sessions on mount, add state for modal"
```

---

### Task 3: Add "+ N more open exams" link below resume card

**Files:**
- Modify: `src/app/(dashboard)/practice/page.tsx:1256-1257` (right after resume card closing div)

**Context:** The resume card ends at line ~1257 with `</div>` + `)}`. We need to add a small link below it (but inside the conditional) that only renders when `allResumableSessions.length > 1`.

**Step 1: Add the link**

Right after the resume card's closing `</div>` (around line 1256), but before the `)}` that closes the `{resumableSession && (` conditional, add:

```tsx
                {allResumableSessions.length > 1 && (
                  <button
                    onClick={() => setShowOpenExamsModal(true)}
                    className="w-full text-center py-1.5 text-xs font-mono text-c-muted hover:text-c-cyan transition-colors"
                  >
                    + {allResumableSessions.length - 1} more open {allResumableSessions.length - 1 === 1 ? 'exam' : 'exams'}
                  </button>
                )}
```

This renders as `+ 2 more open exams` (or `+ 1 more open exam` for singular).

**Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add "src/app/(dashboard)/practice/page.tsx"
git commit -m "feat: add '+ N more open exams' link below resume card"
```

---

### Task 4: Build the open exams modal

**Files:**
- Modify: `src/app/(dashboard)/practice/page.tsx` (add modal before the results modal)

**Context:** The results modal (`examResult !== null`) already exists at the bottom of the JSX. The open exams modal follows the same pattern: fixed overlay + backdrop blur + centered bezel card. It lists all entries from `allResumableSessions` with Continue/Grade/Discard per row. The modal reuses existing functions: `resumeSession()`, and inline grade/discard logic similar to the resume card.

**Step 1: Add helper to remove a session from state**

Near the `gradeResumableSession` function (around line 930), add a helper that removes a session from both state arrays and updates the featured one:

```typescript
  /** Remove a session from the open-exams list (after grade/discard). */
  function removeFromResumable(sessionId: string) {
    setAllResumableSessions(prev => {
      const next = prev.filter(s => s.id !== sessionId);
      // Update featured session to next most recent, or null
      if (resumableSession?.id === sessionId) {
        setResumableSession(next.length > 0 ? next[0] : null);
      }
      return next;
    });
  }
```

**Step 2: Update existing discard handler on resume card**

In the resume card's DISCARD button (around line 1240-1248), after `setResumableSession(null)`, also call `removeFromResumable(resumableSession.id)`:

Replace:
```typescript
setResumableSession(null);
```
With:
```typescript
removeFromResumable(resumableSession.id);
```

**Step 3: Update `gradeResumableSession` to also remove from list**

In `gradeResumableSession()` (around line 940), replace `setResumableSession(null)` with `removeFromResumable(resumableSession.id)`.

**Step 4: Add the modal JSX**

Find the results modal (`{examResult && (`). Right **before** it, add the open exams modal:

```tsx
        {/* Open exams modal */}
        {showOpenExamsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowOpenExamsModal(false)} />
            <div className="relative bg-c-bezel border border-c-border rounded-lg p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-mono text-sm font-semibold text-c-cyan uppercase">OPEN EXAMS</h2>
                <button
                  onClick={() => setShowOpenExamsModal(false)}
                  className="text-c-muted hover:text-c-text text-lg leading-none"
                >&times;</button>
              </div>
              <div className="space-y-3">
                {allResumableSessions.map((session) => (
                  <div key={session.id} className="iframe rounded-lg p-3 border border-c-border">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-c-text font-mono">
                          {session.rating === 'commercial' ? 'Commercial' : session.rating === 'instrument' ? 'Instrument' : session.rating === 'atp' ? 'ATP' : 'Private'}
                          {session.aircraft_class ? ` ${session.aircraft_class}` : ''}
                          , {session.difficulty_preference === 'easy' ? 'Easy' : session.difficulty_preference === 'medium' ? 'Medium' : session.difficulty_preference === 'hard' ? 'Hard' : 'Mixed'}
                          {' '}&mdash; {session.exchange_count || 0} exchanges
                        </p>
                        <p className="text-xs text-c-muted font-mono mt-0.5">
                          {new Date(session.started_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                          })}
                          {' '}&middot; {session.study_mode === 'linear' ? 'Area by Area' : session.study_mode === 'cross_acs' ? 'Across ACS' : 'Weak Areas'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => {
                            setShowOpenExamsModal(false);
                            resumeSession(session);
                          }}
                          disabled={loading || gradingInProgress}
                          className="px-2.5 py-1 bg-c-cyan hover:bg-c-cyan/90 text-c-bg rounded font-mono text-xs font-semibold transition-colors disabled:opacity-50 uppercase"
                        >
                          CONTINUE
                        </button>
                        <button
                          onClick={async () => {
                            setGradingInProgress(true);
                            try {
                              const res = await fetch('/api/session', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'update', sessionId: session.id, status: 'completed' }),
                              });
                              const data = await res.json();
                              removeFromResumable(session.id);
                              if (data.result) {
                                setShowOpenExamsModal(false);
                                setExamResult(data.result as ExamResult);
                              }
                            } catch { /* ignore */ }
                            setGradingInProgress(false);
                          }}
                          disabled={gradingInProgress}
                          className="px-2.5 py-1 bg-c-amber hover:bg-c-amber/90 text-c-bg rounded font-mono text-xs font-semibold transition-colors disabled:opacity-50 uppercase"
                        >
                          {gradingInProgress ? '...' : 'GRADE'}
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm('Discard this exam? It will be marked as abandoned.')) return;
                            await fetch('/api/session', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'update', sessionId: session.id, status: 'abandoned' }),
                            });
                            removeFromResumable(session.id);
                          }}
                          className="px-2.5 py-1 text-c-muted hover:text-red-400 font-mono text-xs transition-colors uppercase"
                        >
                          DISCARD
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {allResumableSessions.length === 0 && (
                <p className="text-xs text-c-muted font-mono text-center py-4">No open exams</p>
              )}
            </div>
          </div>
        )}
```

**Step 5: Close modal when list empties**

The modal should auto-close when all exams are graded/discarded. Add a `useEffect` after the state declarations:

```typescript
  // Auto-close open exams modal when list empties
  useEffect(() => {
    if (showOpenExamsModal && allResumableSessions.length === 0) {
      setShowOpenExamsModal(false);
    }
  }, [allResumableSessions.length, showOpenExamsModal]);
```

**Step 6: Run type-check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 7: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 8: Commit**

```bash
git add "src/app/(dashboard)/practice/page.tsx"
git commit -m "feat: add open exams modal with continue/grade/discard per exam"
```

---

## Verification

1. `npx vitest run` — All tests pass including new GET handler tests
2. `npx tsc --noEmit` — Type-check clean
3. Manual verification:
   - With 0 open exams → no resume card, no link
   - With 1 open exam → resume card shown, no "+ N more" link
   - With 2+ open exams → resume card for most recent, "+ N more open exams" link visible
   - Click link → modal opens with all exams listed
   - CONTINUE on any exam → modal closes, exam loads
   - GRADE on any exam → exam removed from list, results modal appears
   - DISCARD on any exam → confirmation, exam removed from list
   - Grade/discard all exams in modal → modal auto-closes
   - Start new exam while exams are open → only most recent is auto-completed (others stay)
