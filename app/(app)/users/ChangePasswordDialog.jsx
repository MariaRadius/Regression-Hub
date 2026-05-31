'use client';

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { useState } from 'react';
import { showToast } from '@/components/Toast';
import { updateUser as apiUpdateUser } from '@/lib/api/users';

const EMPTY_FORM = { password: '', confirmPassword: '' };

export default function ChangePasswordDialog({
  open,
  onClose,
  onSuccess,
  userId,
  userName,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  function handleClose() {
    onClose();
    setForm(EMPTY_FORM);
    setConfirmError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setConfirmError('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      await apiUpdateUser(userId, { password: form.password });
      showToast('Password updated', 'success');
      onSuccess();
      handleClose();
    } catch (err) {
      showToast(err.message || 'Password update failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth='xs'
      fullWidth
      aria-labelledby='change-password-dialog-title'
    >
      <DialogTitle id='change-password-dialog-title'>
        Change Password — {userName}
      </DialogTitle>
      <DialogContent dividers>
        <Stack
          component='form'
          id='change-password-form'
          onSubmit={handleSubmit}
          spacing={1.75}
        >
          <TextField
            size='small'
            fullWidth
            label='New password'
            type='password'
            value={form.password}
            onChange={(e) => {
              setForm((f) => ({ ...f, password: e.target.value }));
              setConfirmError('');
            }}
            placeholder='Min. 8 characters'
            required
            slotProps={{
              htmlInput: { minLength: 8, autoComplete: 'new-password' },
            }}
          />
          <TextField
            size='small'
            fullWidth
            label='Confirm password'
            type='password'
            value={form.confirmPassword}
            onChange={(e) => {
              const val = e.target.value;
              setForm((f) => ({ ...f, confirmPassword: val }));
              if (form.password && val && form.password !== val) {
                setConfirmError('Passwords do not match');
              } else {
                setConfirmError('');
              }
            }}
            placeholder='Repeat password'
            required
            error={!!confirmError}
            helperText={confirmError}
            slotProps={{ htmlInput: { autoComplete: 'new-password' } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant='outlined' onClick={handleClose}>
          Cancel
        </Button>
        <Button
          type='submit'
          form='change-password-form'
          variant='contained'
          loading={saving}
          disabled={!form.password || form.password.length < 8}
        >
          Update Password
        </Button>
      </DialogActions>
    </Dialog>
  );
}
