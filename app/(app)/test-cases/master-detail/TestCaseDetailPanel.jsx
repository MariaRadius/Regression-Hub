'use client';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import { useEffect, useState } from 'react';
import { listResults } from '@/lib/api/results';
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
  onEdit,
  onAction,
  onClose,
}) {
  const tcId = displayCase?._id ?? null;
  const [envResults, setEnvResults] = useState(null);
  const [envLoading, setEnvLoading] = useState(true);

  useEffect(() => {
    if (!releaseId || !tcId || !environments?.length) {
      setEnvLoading(false);
      return;
    }
    let cancelled = false;
    setEnvLoading(true);

    Promise.all(
      environments.map((env) =>
        listResults(releaseId, { environment: env, tcId }).then((rows) => ({
          env,
          result: rows.find((r) => r.tcId === tcId) ?? null,
        })),
      ),
    )
      .then((rows) => {
        if (!cancelled) {
          setEnvResults(rows);
          setEnvLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setEnvLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [releaseId, tcId, environments]);

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
          onEdit={onEdit}
          onAction={onAction}
          onClose={onClose}
        />
      </Box>
    </>
  );
}
