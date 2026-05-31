'use client';

import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import PersonIcon from '@mui/icons-material/Person';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { showToast } from '@/components/Toast';
import { createUser as apiCreateUser } from '@/lib/api/users';
import { ROLES } from '@/lib/constants';

const EMPTY_FORM = {
  name: '',
  username: '',
  password: '',
  confirmPassword: '',
  role: ROLES.QA,
};

export default function AddUserDialog({ open, onClose, onSuccess, teamName }) {
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
    if (confirmError || form.password !== form.confirmPassword) {
      setConfirmError('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      await apiCreateUser({
        name: form.name,
        username: form.username,
        password: form.password,
        role: form.role,
      });
      showToast(`User "${form.name}" created`, 'success');
      onSuccess();
      handleClose();
    } catch (err) {
      showToast(err.message || 'Failed to create user', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth='sm'
      fullWidth
      aria-labelledby='add-user-dialog-title'
    >
      <DialogTitle id='add-user-dialog-title'>Add New User</DialogTitle>
      <DialogContent dividers>
        <Stack
          component='form'
          id='add-user-form'
          onSubmit={handleSubmit}
          spacing={1.75}
        >
          <Grid container spacing={1.5}>
            <Grid size={6}>
              <TextField
                size='small'
                fullWidth
                label='Full name'
                type='text'
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder='e.g. Maria'
                required
                slotProps={{ htmlInput: { autoComplete: 'off' } }}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                size='small'
                fullWidth
                label='Username'
                type='text'
                value={form.username}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    username: e.target.value.toLowerCase().replace(/\s/g, ''),
                  }))
                }
                placeholder='e.g. maria'
                required
                slotProps={{
                  htmlInput: { autoComplete: 'off', spellCheck: false },
                }}
              />
            </Grid>
          </Grid>

          <Stack spacing={0.75}>
            <Typography variant='tableCell' color='text.secondary'>
              Role
            </Typography>
            <ToggleButtonGroup
              value={form.role}
              onChange={(_, v) => v && setForm((f) => ({ ...f, role: v }))}
              exclusive
              fullWidth
              aria-label='Role'
            >
              {[ROLES.QA, ROLES.ADMIN].map((r) => (
                <ToggleButton
                  key={r}
                  value={r}
                  color={r === ROLES.ADMIN ? 'primary' : 'secondary'}
                >
                  {r === ROLES.ADMIN ? (
                    <AdminPanelSettingsIcon sx={{ mr: 1 }} />
                  ) : (
                    <PersonIcon sx={{ mr: 1 }} />
                  )}
                  {r === ROLES.ADMIN ? 'Admin' : 'QA'}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography variant='tableCell' color='text.disabled'>
              {form.role === ROLES.ADMIN
                ? 'Can manage users, import test cases, clear data, and manage versions.'
                : 'Can fill test results, manage assignments, and export data.'}
            </Typography>
          </Stack>

          <Grid container spacing={1.5}>
            <Grid size={6}>
              <TextField
                size='small'
                fullWidth
                label='Password'
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
            </Grid>
            <Grid size={6}>
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
            </Grid>
          </Grid>

          <Alert severity='info'>
            This user will be added to the <strong>{teamName}</strong> location
            and can only see that location&apos;s data.
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant='outlined' onClick={handleClose}>
          Cancel
        </Button>
        <Button
          type='submit'
          form='add-user-form'
          variant='contained'
          loading={saving}
        >
          Create User
        </Button>
      </DialogActions>
    </Dialog>
  );
}
