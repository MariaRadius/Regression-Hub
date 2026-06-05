// components/SummaryRow.jsx
'use client';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CHART_THEME } from '@/app/(app)/dashboard/charts/chartTheme';

/**
 * Renders a summary row showing pass/fail/pending counts and a CSS flex progress bar.
 * The recharts stacked bar has been replaced with a plain CSS flex bar (no SVG, no library).
 *
 * @see components/__tests__/SummaryRow.test.jsx
 *
 * @param {string} name      — row label (falls back to 'Unassigned')
 * @param {number} passed    — count of passing test cases
 * @param {number} failed    — count of failing test cases
 * @param {number} pending   — count of pending test cases
 * @param {number} total     — sum of passed + failed + pending
 */
export default function SummaryRow({ name, passed, failed, pending, total }) {
  return (
    <Stack
      sx={{
        width: '100%',
        p: 0,
      }}
    >
      <Stack direction='row' spacing={2} sx={{ alignItems: 'center' }}>
        <Typography
          variant='tableCell'
          sx={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name || 'Unassigned'}
        </Typography>
        <Stack direction='row' spacing={2} sx={{ flexShrink: 0 }}>
          <Stack
            direction='row'
            spacing={0.5}
            sx={{
              alignItems: 'center',
              px: 1,
              py: 0.5,
              borderRadius: 999,
              backgroundColor: 'rgba(3,167,105,0.10)',
            }}
          >
            <Typography
              variant='caption'
              sx={{ color: CHART_THEME.pass, fontWeight: 700 }}
            >
              {passed}
            </Typography>
            <Typography
              variant='caption'
              sx={{ color: CHART_THEME.pass, fontWeight: 600 }}
            >
              Pass
            </Typography>
          </Stack>
          <Stack
            direction='row'
            spacing={0.5}
            sx={{
              alignItems: 'center',
              px: 1,
              py: 0.5,
              borderRadius: 999,
              backgroundColor: 'rgba(225,77,90,0.10)',
            }}
          >
            <Typography
              variant='caption'
              sx={{ color: CHART_THEME.fail, fontWeight: 700 }}
            >
              {failed}
            </Typography>
            <Typography
              variant='caption'
              sx={{ color: CHART_THEME.fail, fontWeight: 600 }}
            >
              Fail
            </Typography>
          </Stack>
          <Stack
            direction='row'
            spacing={0.5}
            sx={{
              alignItems: 'center',
              px: 1,
              py: 0.5,
              borderRadius: 999,
              backgroundColor: 'rgba(240,141,47,0.12)',
            }}
          >
            <Typography
              variant='caption'
              sx={{ color: CHART_THEME.pending, fontWeight: 700 }}
            >
              {pending}
            </Typography>
            <Typography
              variant='caption'
              sx={{ color: CHART_THEME.pending, fontWeight: 600 }}
            >
              Pending
            </Typography>
          </Stack>
        </Stack>
      </Stack>
      {total > 0 && (
        <Stack
          data-testid='progress-track'
          sx={{
            mt: 1.25,
            width: '100%',
            p: 0.375,
            borderRadius: 999,
            backgroundColor: 'grey.100',
          }}
        >
          <div
            data-testid='progress-bar'
            style={{
              display: 'flex',
              height: 8,
              borderRadius: 999,
              overflow: 'hidden',
              width: '100%',
              boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.7)',
            }}
          >
            <div
              data-testid='progress-segment-pass'
              style={{ flex: passed, background: CHART_THEME.pass }}
            />
            <div
              data-testid='progress-segment-fail'
              style={{ flex: failed, background: CHART_THEME.fail }}
            />
            <div
              data-testid='progress-segment-pending'
              style={{ flex: pending, background: CHART_THEME.pending }}
            />
          </div>
        </Stack>
      )}
    </Stack>
  );
}
