'use client';

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';

/**
 * Reusable confirmation dialog.
 *
 * Legacy API (backward-compatible): pass `confirmDialog` object + `setConfirmDialog`.
 * New API: pass `open`, `title`, `confirmLabel`, `confirmColor`, `onConfirm`, `onClose`, `children`.
 *
 * @param {{
 *   confirmDialog?: { open: boolean, message: string, onConfirm: function|null },
 *   setConfirmDialog?: function,
 *   open?: boolean,
 *   title?: string,
 *   confirmLabel?: string,
 *   confirmColor?: string,
 *   onConfirm?: function,
 *   onClose?: function,
 *   children?: React.ReactNode,
 * }} props
 */
export default function ConfirmDialog({
  // Legacy API
  confirmDialog,
  setConfirmDialog,
  // New API
  open: openProp,
  title = 'Confirm',
  confirmLabel = 'Confirm',
  confirmColor = 'error',
  onConfirm,
  onClose,
  children,
}) {
  // Legacy mode: derive values from confirmDialog object
  const isLegacy = confirmDialog !== undefined;
  const resolvedOpen = isLegacy ? confirmDialog.open : openProp;
  const resolvedMessage = isLegacy ? confirmDialog.message : null;

  function handleClose() {
    if (isLegacy) setConfirmDialog((prev) => ({ ...prev, open: false }));
    else onClose?.();
  }

  function handleConfirm() {
    if (isLegacy) confirmDialog.onConfirm?.();
    else onConfirm?.();
  }

  return (
    <Dialog open={resolvedOpen} onClose={handleClose} maxWidth='xs' fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {children ?? <DialogContentText>{resolvedMessage}</DialogContentText>}
      </DialogContent>
      <DialogActions>
        <Button variant='outlined' onClick={handleClose}>
          Cancel
        </Button>
        <Button
          variant='contained'
          color={confirmColor}
          onClick={handleConfirm}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
