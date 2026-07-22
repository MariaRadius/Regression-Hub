'use client';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import { useEffect, useState } from 'react';
import { listTestCaseEventsForRelease } from '@/lib/api/releases';
import { listCaseResults } from '@/lib/api/results';
import TestCaseDetail from './TestCaseDetail';

/**
 * Responsive detail panel for a selected test case.
 *
 * - Mobile (xs–sm): fullscreen bottom-sheet Drawer sliding up from the bottom.
 * - Desktop (md+): fixed-position overlay sliding in from the right edge of the
 *   viewport (480 px wide), no backdrop — list remains fully interactive.
 *
 * Close triggers: X button inside TestCaseDetail (via onClose) or Escape key.
 * Backdrop click does NOT close on either breakpoint.
 *
 * @see app/(app)/test-cases/TestCasesClient.jsx
 */
export default function TestCaseDetailPanel({
  open,
  displayCase,
  releaseId,
  environments,
  resultsVersion = 0,
  onEdit,
  onAction,
  onClose,
}) {
  const tcId = displayCase?._id ?? null;
  const [envResults, setEnvResults] = useState(null);
  const [envLoading, setEnvLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEvents, setHistoryEvents] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    if (!releaseId || !tcId || !environments?.length) {
      setEnvLoading(false);
      return;
    }
    let cancelled = false;
    setEnvLoading(true);

    // One purpose-built request returns this case's rows for every
    // environment; align them to the declared `environments` order so envs
    // without a row still render (result: null).
    listCaseResults(releaseId, tcId)
      .then((rows) => {
        if (cancelled) return;
        const byEnv = new Map(rows.map((r) => [r.environment, r]));
        setEnvResults(
          environments.map((env) => ({ env, result: byEnv.get(env) ?? null })),
        );
        setEnvLoading(false);
      })
      .catch(() => {
        if (!cancelled) setEnvLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [releaseId, tcId, environments]);

  // Re-fetch results after a Jira issue is created so jiraIssueKeys appear
  // without a page refresh. Skips the initial mount (resultsVersion === 0).
  // biome-ignore lint/correctness/useExhaustiveDependencies: environments and releaseId/tcId are intentionally omitted — this effect only runs on explicit refresh triggers, not on scope changes (which are handled above).
  useEffect(() => {
    if (!resultsVersion || !releaseId || !tcId || !environments?.length) return;
    listCaseResults(releaseId, tcId)
      .then((rows) => {
        const byEnv = new Map(rows.map((r) => [r.environment, r]));
        setEnvResults(
          environments.map((env) => ({ env, result: byEnv.get(env) ?? null })),
        );
      })
      .catch(() => {});
  }, [resultsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset cached history when the selected case scope changes.
  useEffect(() => {
    setHistoryOpen(false);
    setHistoryEvents(null);
    setHistoryLoading(false);
    setHistoryError('');
  }, [releaseId, tcId]);

  async function handleToggleHistory() {
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }

    setHistoryOpen(true);
    if (!releaseId || !tcId || historyEvents) return;

    setHistoryLoading(true);
    setHistoryError('');
    try {
      const events = await listTestCaseEventsForRelease(releaseId, tcId);
      setHistoryEvents(events);
    } catch {
      setHistoryError('Could not load history.');
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <>
      {/* ── Mobile: fullscreen bottom sheet ──────────────────── */}
      <Drawer
        variant='temporary'
        anchor='bottom'
        open={open}
        onClose={(_, reason) => {
          if (reason === 'escapeKeyDown') onClose();
        }}
        sx={{ display: { md: 'none' } }}
        slotProps={{
          paper: {
            sx: {
              height: '100%',
              borderRadius: 0,
              overflowY: 'auto',
            },
          },
        }}
      >
        {/* Drag handle pill */}
        <Box
          sx={{
            width: 36,
            height: 4,
            borderRadius: 2,
            bgcolor: 'text.disabled',
            mx: 'auto',
            mt: 1.5,
            mb: 0.5,
          }}
        />
        <TestCaseDetail
          tc={displayCase}
          releaseId={releaseId}
          environments={environments}
          envResults={envResults}
          envLoading={envLoading}
          historyOpen={historyOpen}
          historyEvents={historyEvents}
          historyLoading={historyLoading}
          historyError={historyError}
          onToggleHistory={handleToggleHistory}
          onEdit={onEdit}
          onAction={onAction}
          onClose={onClose}
        />
      </Drawer>

      {/* ── Desktop: fixed overlay, no backdrop ──────────────── */}
      <Box
        sx={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: 480,
          transform: open ? 'translateX(0)' : 'translateX(480px)',
          transition: 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: (theme) => theme.zIndex.drawer,
          bgcolor: 'background.paper',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
          display: { xs: 'none', md: 'block' },
          overflowY: 'auto',
        }}
      >
        <TestCaseDetail
          tc={displayCase}
          releaseId={releaseId}
          environments={environments}
          envResults={envResults}
          envLoading={envLoading}
          historyOpen={historyOpen}
          historyEvents={historyEvents}
          historyLoading={historyLoading}
          historyError={historyError}
          onToggleHistory={handleToggleHistory}
          onEdit={onEdit}
          onAction={onAction}
          onClose={onClose}
        />
      </Box>
    </>
  );
}
