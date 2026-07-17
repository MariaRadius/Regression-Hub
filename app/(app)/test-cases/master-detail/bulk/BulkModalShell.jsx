'use client';
import CloseIcon from '@mui/icons-material/Close';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import { STATUS } from '@/lib/constants';

const STATUS_DOT = {
  [STATUS.PASS]: 'success.main',
  [STATUS.FAIL]: 'error.main',
  [STATUS.PENDING]: 'warning.main',
  [STATUS.KNOWN_ISSUE]: 'info.main',
};

/**
 * Shared shell for all bulk action modals.
 * Renders: header (title + close), selection summary box (first 6 + "N more"),
 * optional helper note, children (modal-specific fields), footer (Cancel + Confirm).
 *
 * Selection items are expected to have `testKey` for display.
 */
export default function BulkModalShell({
  open,
  onClose,
  title,
  subtitle,
  selection,
  helperNote,
  helperColor,
  children,
  confirmLabel,
  confirmColor = 'primary',
  confirmDisabled,
  loading,
  footerLeft,
  onConfirm,
}) {
  const visible = selection.slice(0, 6);
  const extra = selection.length - visible.length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle sx={{ pb: 1.5 }}>
        <Stack
          direction='row'
          spacing={1}
          sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}
        >
          <Stack spacing={0.25}>
            <Typography variant='panelTitle' component='h2'>
              {title}
            </Typography>
            {subtitle && (
              <Typography color='text.secondary'>{subtitle}</Typography>
            )}
          </Stack>
          <IconButton size='small' aria-label='Close' onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2}>
          {/* Selection summary */}
          <Box
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              overflow: 'hidden',
            }}
          >
            {/* Header row */}
            <Stack
              direction='row'
              sx={{
                px: 1.5,
                py: 1,
                justifyContent: 'space-between',
                alignItems: 'center',
                bgcolor: 'action.hover',
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <Typography variant='metricLabel' color='text.secondary'>
                Selection
              </Typography>
              <Chip size='small' label={selection.length} />
            </Stack>

            {/* Rows */}
            <Stack sx={{ px: 1.5, py: 1 }} spacing={0.75}>
              {visible.map((s) => (
                <Stack
                  key={s._id}
                  direction='row'
                  spacing={1.25}
                  sx={{ alignItems: 'center' }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: STATUS_DOT[s.status] || 'text.disabled',
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    variant='mono'
                    sx={{ flexShrink: 0, color: 'text.secondary' }}
                  >
                    {s.testKey || '—'}
                  </Typography>
                  <Typography
                    variant='tableCell'
                    noWrap
                    sx={{ flex: 1, minWidth: 0 }}
                  >
                    {s.testCase}
                  </Typography>
                </Stack>
              ))}
              {extra > 0 && (
                <Typography color='text.disabled' sx={{ textAlign: 'center' }}>
                  + {extra} more…
                </Typography>
              )}
            </Stack>
          </Box>

          {children}

          {helperNote && (
            <Alert severity={helperColor || 'info'}>{helperNote}</Alert>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Typography variant='pageSub' color='text.disabled' sx={{ mr: 'auto' }}>
          {footerLeft}
        </Typography>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant='contained'
          color={confirmColor}
          loading={loading}
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
