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

const actionMap = { 1: 'pass', 2: 'fail', 3: 'pending' };

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
      if (!cases?.length) return;
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
          onActionRef.current(actionMap[e.key], activeId);
        }
        return;
      }

      // --- Arrow navigation ---
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
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
