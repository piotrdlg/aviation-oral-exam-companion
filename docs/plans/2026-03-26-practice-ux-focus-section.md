# Practice Page UX — Focus Section Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hidden "Customize Tasks..." link in the practice page SessionConfig with an always-visible "FOCUS" section that shows ACS areas by name with two-level progressive disclosure (areas then tasks).

**Architecture:** Refactor the existing `SessionConfig.tsx` component. The area/task selection data already flows correctly through `selectedTasks` and `selectedAreas` to the exam engine (`buildElementQueue` in exam-logic.ts). The backend wiring is complete — this is primarily a UI restructure with wiring verification tests. Difficulty and Examiner settings are collapsed into a secondary toggle to shorten the form.

**Tech Stack:** React (client component), Tailwind CSS v4 (c-* design tokens), Vitest for tests

**Design Mockup:** `mockups/practice-ux-proposed.html`

---

## Data Flow Reference

```
SessionConfig UI
  → selectedTasks: string[]  (e.g., ['IR.I.A', 'IR.I.B'])
  → selectedAreas: string[]  (derived from selectedTasks, e.g., ['I'])
      ↓
startSession(configData) in practice/page.tsx
  → POST /api/session (persists selected_areas, selected_tasks)
  → POST /api/exam { sessionConfig }
      ↓
initPlanner(sessionConfig) in exam-planner.ts
  → buildElementQueue(elements, config) in exam-logic.ts
      ↓
Priority 1: config.selectedTasks (if non-empty, filter by exact task IDs)
Priority 2: config.selectedAreas (fallback, filter by Roman numeral)
Priority 3: config.difficulty (unless 'mixed')
Priority 4: exclude skill elements (K and R only)
  → studyMode ordering (linear/cross_acs/weak_areas/quick_drill)
```

**Critical invariant:** `selectedTasks` takes priority over `selectedAreas`. When the user checks an area checkbox, ALL task IDs from that area are added to `selectedTasks`. `selectedAreas` is always derived from `selectedTasks` for backwards compatibility.

---

### Task 1: Write tests for Focus section area-level selection wiring

**Files:**
- Create: `src/lib/__tests__/focus-section-wiring.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { buildElementQueue } from '../exam-logic';
import type { SessionConfig } from '@/types/database';

// Matches the AcsElementDB shape from exam-logic.ts
interface TestElement {
  code: string;
  task_id: string;
  element_type: 'knowledge' | 'risk' | 'skill';
  short_code: string;
  description: string;
  order_index: number;
  difficulty_default: 'easy' | 'medium' | 'hard';
  weight: number;
}

function makeElement(code: string, opts?: Partial<TestElement>): TestElement {
  const parts = code.split('.');
  return {
    code,
    task_id: parts.slice(0, 3).join('.'),
    element_type: opts?.element_type ?? 'knowledge',
    short_code: parts[3] || 'K1',
    description: `Element ${code}`,
    order_index: opts?.order_index ?? 0,
    difficulty_default: opts?.difficulty_default ?? 'medium',
    weight: opts?.weight ?? 1.0,
  };
}

const BASE_CONFIG: SessionConfig = {
  rating: 'private',
  aircraftClass: 'ASEL',
  studyMode: 'linear',
  difficulty: 'mixed',
  selectedAreas: [],
  selectedTasks: [],
};

// Simulate all 3 ratings with representative elements
const PRIVATE_ELEMENTS = [
  makeElement('PA.I.A.K1', { order_index: 1 }),
  makeElement('PA.I.A.K2', { order_index: 2 }),
  makeElement('PA.I.B.K1', { order_index: 3 }),
  makeElement('PA.II.A.K1', { order_index: 4 }),
  makeElement('PA.II.A.R1', { element_type: 'risk', order_index: 5 }),
  makeElement('PA.III.A.K1', { order_index: 6 }),
  makeElement('PA.IX.A.K1', { order_index: 7 }),
  makeElement('PA.IX.A.S1', { element_type: 'skill', order_index: 8 }),
];

const COMMERCIAL_ELEMENTS = [
  makeElement('CA.I.A.K1', { order_index: 1 }),
  makeElement('CA.I.B.K1', { order_index: 2 }),
  makeElement('CA.II.A.K1', { order_index: 3 }),
  makeElement('CA.III.A.K1', { order_index: 4 }),
];

const INSTRUMENT_ELEMENTS = [
  makeElement('IR.I.A.K1', { order_index: 1 }),
  makeElement('IR.I.B.K1', { order_index: 2 }),
  makeElement('IR.I.C.K1', { order_index: 3 }),
  makeElement('IR.II.A.K1', { order_index: 4 }),
  makeElement('IR.VI.A.K1', { order_index: 5 }),
  makeElement('IR.VII.A.K1', { order_index: 6 }),
];

describe('Focus section wiring — area-level selection', () => {
  describe('Private Pilot', () => {
    it('includes all oral elements when no areas selected', () => {
      const queue = buildElementQueue(PRIVATE_ELEMENTS, BASE_CONFIG);
      // Should include K and R elements, exclude S
      expect(queue).toContain('PA.I.A.K1');
      expect(queue).toContain('PA.II.A.R1');
      expect(queue).not.toContain('PA.IX.A.S1');
    });

    it('filters to single area via selectedTasks', () => {
      const config = {
        ...BASE_CONFIG,
        selectedTasks: ['PA.I.A', 'PA.I.B'],
        selectedAreas: ['I'],
      };
      const queue = buildElementQueue(PRIVATE_ELEMENTS, config);
      expect(queue).toContain('PA.I.A.K1');
      expect(queue).toContain('PA.I.A.K2');
      expect(queue).toContain('PA.I.B.K1');
      expect(queue).not.toContain('PA.II.A.K1');
      expect(queue).not.toContain('PA.IX.A.K1');
    });

    it('filters to multiple areas via selectedTasks', () => {
      const config = {
        ...BASE_CONFIG,
        selectedTasks: ['PA.I.A', 'PA.IX.A'],
        selectedAreas: ['I', 'IX'],
      };
      const queue = buildElementQueue(PRIVATE_ELEMENTS, config);
      expect(queue).toContain('PA.I.A.K1');
      expect(queue).toContain('PA.IX.A.K1');
      expect(queue).not.toContain('PA.II.A.K1');
      expect(queue).not.toContain('PA.III.A.K1');
    });

    it('selectedTasks takes priority over selectedAreas', () => {
      const config = {
        ...BASE_CONFIG,
        selectedTasks: ['PA.IX.A'],
        selectedAreas: ['I'], // contradicts selectedTasks
      };
      const queue = buildElementQueue(PRIVATE_ELEMENTS, config);
      expect(queue).toContain('PA.IX.A.K1');
      expect(queue).not.toContain('PA.I.A.K1');
    });

    it('excludes skill elements even when area selected', () => {
      const config = {
        ...BASE_CONFIG,
        selectedTasks: ['PA.IX.A'],
        selectedAreas: ['IX'],
      };
      const queue = buildElementQueue(PRIVATE_ELEMENTS, config);
      expect(queue).toContain('PA.IX.A.K1');
      expect(queue).not.toContain('PA.IX.A.S1');
    });
  });

  describe('Commercial Pilot', () => {
    it('includes all oral elements when no areas selected', () => {
      const config = { ...BASE_CONFIG, rating: 'commercial' as const };
      const queue = buildElementQueue(COMMERCIAL_ELEMENTS, config);
      expect(queue).toContain('CA.I.A.K1');
      expect(queue).toContain('CA.III.A.K1');
      expect(queue).toHaveLength(4);
    });

    it('filters to selected area via selectedTasks', () => {
      const config = {
        ...BASE_CONFIG,
        rating: 'commercial' as const,
        selectedTasks: ['CA.I.A', 'CA.I.B'],
        selectedAreas: ['I'],
      };
      const queue = buildElementQueue(COMMERCIAL_ELEMENTS, config);
      expect(queue).toContain('CA.I.A.K1');
      expect(queue).toContain('CA.I.B.K1');
      expect(queue).not.toContain('CA.II.A.K1');
    });
  });

  describe('Instrument Rating', () => {
    it('includes all oral elements when no areas selected', () => {
      const config = { ...BASE_CONFIG, rating: 'instrument' as const };
      const queue = buildElementQueue(INSTRUMENT_ELEMENTS, config);
      expect(queue).toHaveLength(6);
    });

    it('filters to Preflight Preparation (Area I) via selectedTasks', () => {
      const config = {
        ...BASE_CONFIG,
        rating: 'instrument' as const,
        selectedTasks: ['IR.I.A', 'IR.I.B', 'IR.I.C'],
        selectedAreas: ['I'],
      };
      const queue = buildElementQueue(INSTRUMENT_ELEMENTS, config);
      expect(queue).toContain('IR.I.A.K1');
      expect(queue).toContain('IR.I.B.K1');
      expect(queue).toContain('IR.I.C.K1');
      expect(queue).not.toContain('IR.II.A.K1');
      expect(queue).not.toContain('IR.VI.A.K1');
    });

    it('filters to Approach + Emergency areas via selectedTasks', () => {
      const config = {
        ...BASE_CONFIG,
        rating: 'instrument' as const,
        selectedTasks: ['IR.VI.A', 'IR.VII.A'],
        selectedAreas: ['VI', 'VII'],
      };
      const queue = buildElementQueue(INSTRUMENT_ELEMENTS, config);
      expect(queue).toContain('IR.VI.A.K1');
      expect(queue).toContain('IR.VII.A.K1');
      expect(queue).not.toContain('IR.I.A.K1');
      expect(queue).toHaveLength(2);
    });
  });

  describe('Study mode + Focus interaction', () => {
    it('linear mode preserves element order within selected area', () => {
      const config = {
        ...BASE_CONFIG,
        studyMode: 'linear' as const,
        selectedTasks: ['PA.I.A'],
        selectedAreas: ['I'],
      };
      const queue = buildElementQueue(PRIVATE_ELEMENTS, config);
      const k1Idx = queue.indexOf('PA.I.A.K1');
      const k2Idx = queue.indexOf('PA.I.A.K2');
      expect(k1Idx).toBeLessThan(k2Idx);
    });

    it('cross_acs mode shuffles within selected areas', () => {
      const config = {
        ...BASE_CONFIG,
        studyMode: 'cross_acs' as const,
        selectedTasks: ['PA.I.A', 'PA.I.B', 'PA.II.A', 'PA.IX.A'],
        selectedAreas: ['I', 'II', 'IX'],
      };
      const linearQueue = buildElementQueue(PRIVATE_ELEMENTS, {
        ...config,
        studyMode: 'linear',
      });
      let differed = false;
      for (let i = 0; i < 20; i++) {
        const shuffled = buildElementQueue(PRIVATE_ELEMENTS, config);
        if (shuffled.join(',') !== linearQueue.join(',')) {
          differed = true;
          break;
        }
      }
      // cross_acs should differ from linear at least once in 20 tries
      expect(differed).toBe(true);
    });

    it('difficulty filter combines with area selection', () => {
      const elements = [
        makeElement('PA.I.A.K1', { difficulty_default: 'easy', order_index: 1 }),
        makeElement('PA.I.A.K2', { difficulty_default: 'hard', order_index: 2 }),
        makeElement('PA.II.A.K1', { difficulty_default: 'easy', order_index: 3 }),
      ];
      const config = {
        ...BASE_CONFIG,
        difficulty: 'easy' as const,
        selectedTasks: ['PA.I.A'],
        selectedAreas: ['I'],
      };
      const queue = buildElementQueue(elements, config);
      expect(queue).toContain('PA.I.A.K1');
      expect(queue).not.toContain('PA.I.A.K2');
      expect(queue).not.toContain('PA.II.A.K1');
    });
  });
});
```

**Step 2: Run tests to verify they pass (existing logic should work)**

Run: `npx vitest run src/lib/__tests__/focus-section-wiring.test.ts`
Expected: All tests PASS (the wiring already works, we're documenting it)

**Step 3: Commit**

```bash
git add src/lib/__tests__/focus-section-wiring.test.ts
git commit -m "test: add Focus section wiring tests for all 3 ratings"
```

---

### Task 2: Refactor SessionConfig — Replace hidden task picker with Focus section

**Files:**
- Modify: `src/app/(dashboard)/practice/components/SessionConfig.tsx`

**Step 1: Restructure the component**

Replace the entire `SessionConfig.tsx` with a refactored version that:
1. Keeps Study Mode grid (unchanged)
2. Adds visible FOCUS section with area-level checkboxes
3. Each area row shows: checkbox, roman numeral, area name, "N tasks ▸" link
4. First area auto-expanded on mount
5. Collapses Difficulty + Examiner into a toggle
6. Adds pre-start summary line above Start button

Key implementation details:
- Area checkbox click → toggles all tasks in that area in `selectedTasks[]`
- "N tasks ▸" click → toggles expand/collapse for that area
- Task checkbox click → toggles individual task in `selectedTasks[]`
- `selectedAreas` derived from `selectedTasks` (existing pattern, unchanged)
- First area (`areaGroups[0]`) starts with `expandedAreas` containing its ID

```typescript
// State additions
const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
const [showSecondary, setShowSecondary] = useState(true);

// Auto-expand first area once tasks load
useEffect(() => {
  if (areaGroups.length > 0 && expandedAreas.size === 0) {
    setExpandedAreas(new Set([areaGroups[0].areaId]));
  }
}, [areaGroups]); // eslint-disable-line react-hooks/exhaustive-deps
```

The rendering order becomes:
1. Rating bar (read-only)
2. Study Mode grid
3. **FOCUS section** (always visible)
4. Secondary settings toggle (Difficulty + Examiner)
5. Summary line + Start button

**Step 2: Implement the full component rewrite**

See the complete implementation below. The critical wiring points:
- `toggleArea()` already adds/removes all task IDs (existing function, unchanged)
- `toggleTask()` already toggles individual task IDs (existing function, unchanged)
- `selectedAreas` is already derived via `useMemo` from `selectedTasks` (existing, unchanged)
- `onStart()` callback already receives `{ selectedAreas, selectedTasks, ... }` (unchanged)

The Focus section replaces lines 235-320 (the old `showTaskPicker` toggle + hidden panel).

**Step 3: Run existing tests to verify nothing breaks**

Run: `npx vitest run`
Expected: All existing tests pass

**Step 4: Commit**

```bash
git add src/app/(dashboard)/practice/components/SessionConfig.tsx
git commit -m "feat(ux): replace hidden Customize Tasks with visible Focus section

- Always-visible area checkboxes with human-readable names
- Two-level disclosure: areas (visible) → tasks (expandable)
- First area auto-expanded to teach the pattern
- Difficulty & Examiner collapsed into secondary settings
- Pre-start summary line above Start button"
```

---

### Task 3: Add pre-start summary line

**Files:**
- Modify: `src/app/(dashboard)/practice/components/SessionConfig.tsx` (within Task 2's changes)

The summary line shows: `{studyMode} · {N areas} · {N tasks} · {difficulty}`

```typescript
// Compute summary values
const summaryMode = studyMode === 'linear' ? 'Area by Area'
  : studyMode === 'cross_acs' ? 'Across ACS'
  : studyMode === 'weak_areas' ? 'Weak Areas'
  : 'Quick Drill';

const summaryScope = selectedTasks.length > 0
  ? `${selectedAreas.length} ${selectedAreas.length === 1 ? 'area' : 'areas'} · ${selectedTasks.length} ${selectedTasks.length === 1 ? 'task' : 'tasks'}`
  : `All ${filteredTasks.length} tasks`;

const summaryDiff = difficulty === 'mixed' ? 'Mixed' : difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
```

This is part of Task 2's commit.

---

### Task 4: Condensed Examiner bar

**Files:**
- Modify: `src/app/(dashboard)/practice/components/SessionConfig.tsx` (within Task 2's changes)

Replace the full-sentence examiner description with a condensed one-liner:
- Before: `MARIA TORRES · CALM AND SYSTEMATIC. MOVES THROUGH TOPICS STEADILY WITH A NEUTRAL TONE.`
- After: `MARIA TORRES — Calm and systematic` + `SETTINGS →`

This is part of Task 2's commit.

---

### Task 5: Run full test suite and verify all 3 ratings

**Step 1: Run all unit tests**

Run: `npx vitest run`
Expected: All tests pass including the new focus-section-wiring tests

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 3: Verify build succeeds**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Manual verification checklist**

Open `http://localhost:3000/practice` and verify:

For each rating (change in Settings):
- [ ] **Private Pilot**: Focus section shows 9 oral areas with correct task counts
- [ ] **Commercial Pilot**: Focus section shows correct areas with correct task counts
- [ ] **Instrument Rating**: Focus section shows 7 areas with correct task counts
- [ ] First area auto-expanded on load
- [ ] Clicking area checkbox selects/deselects all tasks
- [ ] Clicking "N tasks ▸" expands to show individual tasks
- [ ] Partial task selection shows dash (–) in area checkbox
- [ ] Summary line updates live: mode, areas, tasks, difficulty
- [ ] "Select none" = all tasks included (full exam)
- [ ] Start exam works with area selection → examiner asks from selected areas only
- [ ] Start exam works with no selection → examiner covers all areas
- [ ] Difficulty + Examiner toggle expands/collapses
- [ ] Quick Drill mode still works (auto-scoped)

**Step 5: Final commit**

```bash
git add -A
git commit -m "test: verify Focus section wiring across all ratings"
```

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `src/lib/__tests__/focus-section-wiring.test.ts` | Create | 20+ tests verifying area/task selection wiring for all 3 ratings |
| `src/app/(dashboard)/practice/components/SessionConfig.tsx` | Modify | Replace hidden task picker with visible Focus section, collapse secondary settings |

## No Backend Changes Required

The `selectedTasks` and `selectedAreas` fields already flow correctly through:
- `practice/page.tsx` → `startSession()` → POST `/api/exam`
- `exam/route.ts` → `initPlanner(sessionConfig)`
- `exam-planner.ts` → `buildElementQueue(elements, config)`
- `exam-logic.ts` → filtering by `selectedTasks` (priority) then `selectedAreas` (fallback)

The Focus section is a pure UI restructure. The data contract (`SessionConfigData` interface) is unchanged.
