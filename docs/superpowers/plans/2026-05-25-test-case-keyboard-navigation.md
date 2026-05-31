# Test Case Keyboard Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arrow-left / arrow-right cycles the selected test case; Ctrl+1/2/3/4 fires pass / fail / pending / edit for the active test case — all gated on: a row is selected, no modal is open, and no interactive element has keyboard focus.

**Architecture:** A single new hook `useTestCaseKeyNav` owns the `document` keydown listener and the scroll-into-view side-effect. It receives `cases`, `activeId`, `setActiveId`, `openModal`, `onAction`, and `onEdit` from `TestCasesClient`. Callbacks (`onAction`, `onEdit`) are held in refs inside the hook so the listener is not re-registered on every render. A `data-case-id` attribute on each `TestCaseListItem` root element lets the hook scroll the newly active row into view without prop drilling or ref maps.

**Tech Stack:** React `useEffect` / `useRef` (client-only), `document.addEventListener`, `Element.scrollIntoView`. No new deps.

**Commit prefix:** `RXR-11849:`

---

## Keyboard navigation behaviour contract

| Condition                                                                            | Behaviour                                                                          |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `activeId` is `null` (no row selected)                                               | all shortcuts: no-op                                                               |
| `openModal` is non-null (any modal open)                                             | all shortcuts: no-op                                                               |
| `document.activeElement` is INPUT / TEXTAREA / SELECT / BUTTON / A / contenteditable | all shortcuts: no-op                                                               |
| Active row is first on page, ArrowLeft pressed                                       | no-op (no wrap, no cross-page)                                                     |
| Active row is last on page, ArrowRight pressed                                       | no-op (no wrap, no cross-page)                                                     |
| ArrowLeft / ArrowRight otherwise                                                     | advance index ±1 within `cases`, call `setActiveId`, scroll new item into view     |
| Ctrl+1                                                                               | call `onAction('pass', activeId)` → opens BulkPassModal scoped to active row       |
| Ctrl+2                                                                               | call `onAction('fail', activeId)` → opens BulkFailModal scoped to active row       |
| Ctrl+3                                                                               | call `onAction('pending', activeId)` → opens BulkPendingModal scoped to active row |
| Ctrl+4                                                                               | call `onEdit(activeTc)` → opens the full Edit dialog for the active row            |

`e.preventDefault()` is called **only when a shortcut actually fires**.

---

## File Structure

**Create:**

- `hooks/useTestCaseKeyNav.js` — keydown listener + scroll-into-view side-effect

**Modify:**

- `app/(app)/test-cases/master-detail/TestCaseListItem.jsx` — add `data-case-id={tc._id}` to root Stack
- `app/(app)/test-cases/TestCasesClient.jsx` — import and call `useTestCaseKeyNav`

> Note: tests are gated — do **not** add test files without explicit user approval (CLAUDE.md).

---

## Task 1: Create `useTestCaseKeyNav` hook

**Files:**

- Create: `hooks/useTestCaseKeyNav.js`

- [ ] **Step 1: Create the hook**

```js
'use client';
import { useEffect, useRef } from 'react';

// Tags whose focus blocks all keyboard shortcuts in this hook.
// These elements own their own arrow-key / digit behaviour.
const INTERACTIVE_TAGS = new Set([
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'BUTTON',
  'A',
]);

/**
 * Keyboard shortcuts for the test-case master-detail panel.
 *
 * Arrow navigation
 *   ArrowLeft  — previous test case on current page (no wrap)
 *   ArrowRight — next test case on current page (no wrap)
 *
 * Action shortcuts (require Ctrl key)
 *   Ctrl+1 — open Pass modal for active test case
 *   Ctrl+2 — open Fail modal for active test case
 *   Ctrl+3 — open Pending modal for active test case
 *   Ctrl+4 — open Edit dialog for active test case
 *
 * All shortcuts are no-ops when:
 *   - no test case is active (activeId is null)
 *   - a modal is open (openModal is non-null)
 *   - an interactive element (INPUT/TEXTAREA/SELECT/BUTTON/A/contenteditable) has focus
 *
 * @see app/(app)/test-cases/TestCasesClient.jsx
 */
export function useTestCaseKeyNav({
  cases,
  activeId,
  setActiveId,
  openModal,
  onAction,
  onEdit,
}) {
  // Hold callbacks in refs so the keydown listener never needs to be
  // re-registered when onAction / onEdit change (they recreate each render
  // as inline arrow functions in TestCasesClient).
  const onActionRef = useRef(onAction);
  const onEditRef = useRef(onEdit);
  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);
  useEffect(() => {
    onEditRef.current = onEdit;
  }, [onEdit]);

  // Re-register the listener when navigation-relevant state changes.
  useEffect(() => {
    function handleKeyDown(e) {
      // --- shared guards ---
      if (!activeId) return;
      if (openModal) return;
      const el = document.activeElement;
      if (el && (INTERACTIVE_TAGS.has(el.tagName) || el.isContentEditable))
        return;

      // --- Ctrl+1/2/3/4 action shortcuts ---
      if (e.ctrlKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        if (e.key === '4') {
          const tc = cases.find((c) => c._id === activeId);
          if (tc) onEditRef.current(tc);
        } else {
          const actionMap = { 1: 'pass', 2: 'fail', 3: 'pending' };
          onActionRef.current(actionMap[e.key], activeId);
        }
        return;
      }

      // --- Arrow navigation ---
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const idx = cases.findIndex((c) => c._id === activeId);
      if (idx === -1) return;
      const nextIdx = e.key === 'ArrowRight' ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= cases.length) return;
      e.preventDefault();
      setActiveId(cases[nextIdx]._id);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [cases, activeId, openModal, setActiveId]);

  // Scroll newly active item into view after every activeId change.
  // `block: 'nearest'` is a no-op when the element is already fully visible.
  useEffect(() => {
    if (!activeId) return;
    const el = document.querySelector(`[data-case-id="${activeId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeId]);
}
```

- [ ] **Step 2: Lint**

```bash
npm run lint -- hooks/useTestCaseKeyNav.js
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/useTestCaseKeyNav.js
git commit -m "RXR-11849: add useTestCaseKeyNav — arrow navigation + Ctrl+1-4 shortcuts"
```

---

## Task 2: Add `data-case-id` to `TestCaseListItem`

**Files:**

- Modify: `app/(app)/test-cases/master-detail/TestCaseListItem.jsx`

The hook uses `document.querySelector('[data-case-id="<id>"]')` to scroll the active row into view. The attribute must live on the outermost element of each list item so the selector is unambiguous.

- [ ] **Step 1: Add `data-case-id` to the root Stack**

In `TestCaseListItem.jsx`, find the opening `<Stack` tag that has `onClick={onClick}` (the component's root element) and add the data attribute:

```jsx
<Stack
  data-case-id={tc._id}
  direction='row'
  spacing={1.5}
  onClick={onClick}
  sx={{ ... }}
>
```

- [ ] **Step 2: Lint & commit**

```bash
npm run lint -- "app/(app)/test-cases/master-detail/TestCaseListItem.jsx"
git add "app/(app)/test-cases/master-detail/TestCaseListItem.jsx"
git commit -m "RXR-11849: add data-case-id attr to TestCaseListItem for keyboard scroll-into-view"
```

---

## Task 3: Wire `useTestCaseKeyNav` in `TestCasesClient`

**Files:**

- Modify: `app/(app)/test-cases/TestCasesClient.jsx`

`TestCasesClient` holds all six values the hook needs. The call site is one line, placed after the existing hook calls in the "Master-detail state" section.

- [ ] **Step 1: Import the hook**

Add to the existing import block alongside the other hook imports:

```js
import { useTestCaseKeyNav } from '@/hooks/useTestCaseKeyNav';
```

- [ ] **Step 2: Call the hook**

After the `useTestCaseSelection` call (around line 117):

```js
useTestCaseKeyNav({
  cases,
  activeId,
  setActiveId,
  openModal,
  onAction: (a, id) => {
    setSingleActionId(id);
    setOpenModal(a);
  },
  onEdit: openEdit,
});
```

No return value — the hook is purely a side-effect.

- [ ] **Step 3: Lint & commit**

```bash
npm run lint -- "app/(app)/test-cases/TestCasesClient.jsx"
git add "app/(app)/test-cases/TestCasesClient.jsx"
git commit -m "RXR-11849: wire useTestCaseKeyNav in TestCasesClient"
```

---

## Task 4: Manual verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify arrow navigation**

1. Open `/test-cases`. Click any row — detail panel opens.
2. Click a blank area (no element focused). Press **→**. Confirm the next test case loads and the list scrolls the new row into view.
3. Press **←**. Confirm previous test case loads.
4. Navigate to the **first** row. Press **←**. Confirm nothing happens (no wrap).
5. Navigate to the **last** row on the page. Press **→**. Confirm nothing happens.

- [ ] **Step 3: Verify Ctrl shortcuts**

6. With a row active and no modal open, press **Ctrl+1**. Confirm BulkPassModal opens pre-scoped to that one row.
7. Close. Press **Ctrl+2**. Confirm BulkFailModal opens.
8. Close. Press **Ctrl+3**. Confirm BulkPendingModal opens.
9. Close. Press **Ctrl+4**. Confirm the full Edit dialog opens for the active test case.

- [ ] **Step 4: Verify guards apply to all shortcuts**

10. Click the **Search** field. Press **→** / **Ctrl+1**. Confirm neither fires.
11. Click the **Pass** button in the detail panel. Press **→** / **Ctrl+1**. Confirm neither fires.
12. Open any modal. Press **→** / **Ctrl+1**. Confirm neither fires.

- [ ] **Step 5: Stop dev server**

---

## Verification matrix

| Requirement                                               | Covered by                                     |
| --------------------------------------------------------- | ---------------------------------------------- |
| ArrowRight advances to next test case                     | Task 3 + Task 4 step 2                         |
| ArrowLeft goes to previous test case                      | Task 3 + Task 4 step 2                         |
| Ctrl+1 opens Pass modal scoped to active row              | Task 3 + Task 4 step 3                         |
| Ctrl+2 opens Fail modal scoped to active row              | Task 3 + Task 4 step 3                         |
| Ctrl+3 opens Pending modal scoped to active row           | Task 3 + Task 4 step 3                         |
| Ctrl+4 opens Edit dialog for active row                   | Task 3 + Task 4 step 3                         |
| No-op when `activeId` is null                             | hook guard: `if (!activeId) return`            |
| No-op when a modal is open                                | hook guard: `if (openModal) return`            |
| No-op when INPUT / TEXTAREA / SELECT / BUTTON / A focused | hook guard: INTERACTIVE_TAGS check             |
| No-op when contenteditable focused                        | hook guard: `el.isContentEditable`             |
| Stops at page boundaries (no wrap, no cross-page)         | `nextIdx < 0 \|\| nextIdx >= cases.length`     |
| List scrolls new item into view                           | `scrollIntoView` effect on `activeId` change   |
| No page scroll on arrow press                             | `e.preventDefault()` only on actual navigation |
| `onAction` / `onEdit` changes don't cause listener churn  | ref pattern — not in `useEffect` dep array     |
