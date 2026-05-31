'use client';

import AddIcon from '@mui/icons-material/Add';
import BlockIcon from '@mui/icons-material/Block';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import KeyIcon from '@mui/icons-material/Key';
import RestoreIcon from '@mui/icons-material/Restore';
import {
  Alert,
  Avatar,
  Button,
  Chip,
  Collapse,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { locationToChipColor, roleToChipColor } from '@/app/theme';
import ConfirmDialog from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import Panel from '@/components/Panel';
import { showToast } from '@/components/Toast';
import { updateUser as apiUpdateUser } from '@/lib/api/users';
import { ROLES } from '@/lib/constants';
import AddUserDialog from './AddUserDialog';
import ChangePasswordDialog from './ChangePasswordDialog';

const EMPTY_EDIT = { name: '', role: ROLES.QA };

export default function UsersClient({ user, initialUsers }) {
  const router = useRouter();

  const roleInfoKey = `roleInfoDismissed:${user.id}`;
  const [showRoleInfo, setShowRoleInfo] = useState(true);
  useEffect(() => {
    if (sessionStorage.getItem(roleInfoKey) === 'true') {
      setShowRoleInfo(false);
    }
  }, [roleInfoKey]);
  const [showAdd, setShowAdd] = useState(false);

  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT);
  const [editSaving, setEditSaving] = useState(false);

  const [pwdUser, setPwdUser] = useState(null);

  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    message: '',
    onConfirm: null,
  });

  async function saveEdit(id) {
    setEditSaving(true);
    try {
      await apiUpdateUser(id, editForm);
      showToast('User updated', 'success');
      setEditId(null);
      router.refresh();
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
    } finally {
      setEditSaving(false);
    }
  }

  function toggleActive(u) {
    const action = u.active !== false ? 'deactivate' : 'activate';
    setConfirmDialog({
      open: true,
      message: `${action.charAt(0).toUpperCase() + action.slice(1)} ${u.name}?`,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        try {
          await apiUpdateUser(u._id, { active: u.active === false });
          showToast(`User ${action}d`, 'success');
          setEditId(null);
          router.refresh();
        } catch (err) {
          showToast(err.message || 'Action failed', 'error');
        }
      },
    });
  }

  const activeUsers = initialUsers.filter((u) => u.active !== false);
  const inactiveUsers = initialUsers.filter((u) => u.active === false);

  return (
    <Stack spacing={3}>
      {/* Header */}
      <PageHeader
        eyebrow='Admin'
        title='User Management'
        sub={
          <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
            <Chip
              label={user.teamName}
              color={locationToChipColor(user.teamId)}
              size='small'
            />
            <Typography variant='tableCell' color='text.secondary'>
              {activeUsers.length} active · {inactiveUsers.length} inactive
            </Typography>
          </Stack>
        }
        actions={
          <Button
            variant='contained'
            size='small'
            startIcon={<AddIcon />}
            onClick={() => setShowAdd(true)}
          >
            Add User
          </Button>
        }
      />

      {/* Role permissions info */}
      <Collapse in={showRoleInfo}>
        <Alert
          variant='outlined'
          severity='info'
          onClose={() => {
            sessionStorage.setItem(roleInfoKey, 'true');
            setShowRoleInfo(false);
          }}
        >
          <Grid container spacing={3}>
            {[
              {
                role: ROLES.ADMIN,
                label: 'Admin',
                allow: [
                  'Manage users (create, edit, passwords)',
                  'Import Test Cases & manage versions',
                  'Clear all data',
                  'Full test case access',
                  'Assignments & reports',
                ],
                deny: [],
              },
              {
                role: ROLES.QA,
                label: 'QA',
                allow: [
                  'View & fill test case results',
                  'Manage assignments',
                  'View reports & dashboard',
                  'Export data (Excel / PDF)',
                ],
                deny: ['Import Test Cases', 'Clear data', 'Manage users'],
              },
            ].map(({ role, label, allow, deny }) => (
              <Grid key={role} size={6}>
                <Typography
                  variant='panelTitle'
                  component='h2'
                  sx={{ display: 'block', mb: 1 }}
                >
                  {label}
                </Typography>
                <List dense disablePadding>
                  {allow.map((item) => (
                    <ListItem key={item} sx={{ py: 0.25 }}>
                      <ListItemIcon
                        sx={{ minWidth: 28, color: 'success.main' }}
                      >
                        <CheckIcon fontSize='small' />
                      </ListItemIcon>
                      <ListItemText
                        primary={item}
                        slotProps={{
                          primary: {
                            variant: 'tableCell',
                            color: 'text.disabled',
                          },
                        }}
                      />
                    </ListItem>
                  ))}
                  {deny.map((item) => (
                    <ListItem key={item} sx={{ py: 0.25 }}>
                      <ListItemIcon sx={{ minWidth: 28, color: 'error.main' }}>
                        <CloseIcon fontSize='small' />
                      </ListItemIcon>
                      <ListItemText
                        primary={item}
                        slotProps={{
                          primary: {
                            variant: 'tableCell',
                            color: 'text.disabled',
                          },
                        }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Grid>
            ))}
          </Grid>
        </Alert>
      </Collapse>

      {/* Users Table */}
      <Panel title='Users'>
        <TableContainer>
          <Table size='small' stickyHeader>
            <TableHead
              sx={{
                '& th': {
                  bgcolor: 'action.selected',
                  borderBottomWidth: 2,
                  borderBottomColor: 'divider',
                },
              }}
            >
              <TableRow>
                <TableCell sx={{ width: 44 }} />
                <TableCell>Name</TableCell>
                <TableCell>Username</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align='right'>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {initialUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState title='No users found'>
                      <Button
                        variant='contained'
                        size='small'
                        onClick={() => setShowAdd(true)}
                      >
                        Add User
                      </Button>
                    </EmptyState>
                  </TableCell>
                </TableRow>
              ) : (
                initialUsers.map((u) => {
                  const isSelf = u._id === user.id;
                  const isActive = u.active !== false;
                  const isEditing = editId === u._id;
                  const isAdmin = u.role === ROLES.ADMIN;

                  return (
                    <TableRow key={u._id} hover>
                      <TableCell
                        sx={{ py: 1.25, px: 1.5, opacity: isActive ? 1 : 0.5 }}
                      >
                        <Avatar
                          sx={{
                            width: 36,
                            height: 36,
                            bgcolor: isAdmin
                              ? 'primary.main'
                              : 'secondary.main',
                            fontSize: 14,
                            fontWeight: 700,
                          }}
                        >
                          {(u.name || '?')[0].toUpperCase()}
                        </Avatar>
                      </TableCell>

                      <TableCell sx={{ opacity: isActive ? 1 : 0.5 }}>
                        {isEditing ? (
                          <TextField
                            size='small'
                            label='Name'
                            value={editForm.name}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                name: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          <Stack
                            direction='row'
                            spacing={0.75}
                            sx={{ alignItems: 'center' }}
                          >
                            <Typography variant='tableCell' fontWeight={600}>
                              {u.name}
                            </Typography>
                            {isSelf && (
                              <Chip
                                label='You'
                                size='small'
                                color='primary'
                                variant='outlined'
                                sx={{
                                  height: 18,
                                  fontSize: 10,
                                  fontWeight: 700,
                                }}
                              />
                            )}
                          </Stack>
                        )}
                      </TableCell>

                      <TableCell sx={{ opacity: isActive ? 1 : 0.5 }}>
                        <Typography variant='mono'>{u.username}</Typography>
                      </TableCell>

                      <TableCell sx={{ opacity: isActive ? 1 : 0.5 }}>
                        {isEditing ? (
                          <Tooltip
                            title={
                              isSelf ? 'You cannot change your own role' : ''
                            }
                            disableHoverListener={!isSelf}
                            disableFocusListener={!isSelf}
                            disableTouchListener={!isSelf}
                          >
                            <span>
                              <TextField
                                select
                                size='small'
                                label='Role'
                                value={editForm.role}
                                disabled={isSelf}
                                onChange={(e) =>
                                  setEditForm((f) => ({
                                    ...f,
                                    role: e.target.value,
                                  }))
                                }
                                sx={{ minWidth: 100 }}
                              >
                                <MenuItem value={ROLES.ADMIN}>Admin</MenuItem>
                                <MenuItem value={ROLES.QA}>QA</MenuItem>
                              </TextField>
                            </span>
                          </Tooltip>
                        ) : (
                          <Chip
                            label={u.role === ROLES.ADMIN ? 'Admin' : 'QA'}
                            color={roleToChipColor(u.role)}
                            size='small'
                          />
                        )}
                      </TableCell>

                      <TableCell sx={{ opacity: isActive ? 1 : 0.5 }}>
                        <Chip
                          label={isActive ? 'Active' : 'Inactive'}
                          color={isActive ? 'success' : 'default'}
                          size='small'
                          variant={isActive ? 'filled' : 'outlined'}
                        />
                      </TableCell>

                      <TableCell sx={{ opacity: isActive ? 1 : 0.5 }}>
                        <Typography variant='tableCell' color='text.disabled'>
                          {u.createdAt
                            ? new Date(u.createdAt).toLocaleDateString(
                                'en-US',
                                {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                },
                              )
                            : '—'}
                        </Typography>
                      </TableCell>

                      <TableCell align='right'>
                        {isEditing ? (
                          <Stack
                            direction='row'
                            spacing={0.75}
                            sx={{ justifyContent: 'flex-end' }}
                          >
                            <Button
                              variant='outlined'
                              size='small'
                              onClick={() => setEditId(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant='contained'
                              size='small'
                              loading={editSaving}
                              onClick={() => saveEdit(u._id)}
                            >
                              Save
                            </Button>
                          </Stack>
                        ) : (
                          <Stack
                            direction='row'
                            spacing={0.25}
                            sx={{ justifyContent: 'flex-end' }}
                          >
                            <Tooltip title='Edit name / role'>
                              <IconButton
                                size='small'
                                aria-label='Edit name / role'
                                onClick={() => {
                                  setEditId(u._id);
                                  setEditForm({ name: u.name, role: u.role });
                                }}
                              >
                                <EditIcon fontSize='small' />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title='Change password'>
                              <IconButton
                                size='small'
                                aria-label='Change password'
                                onClick={() =>
                                  setPwdUser({ _id: u._id, name: u.name })
                                }
                              >
                                <KeyIcon fontSize='small' />
                              </IconButton>
                            </Tooltip>
                            {!isSelf && (
                              <Tooltip
                                title={
                                  isActive
                                    ? 'Deactivate user'
                                    : 'Reactivate user'
                                }
                              >
                                <IconButton
                                  size='small'
                                  aria-label={
                                    isActive
                                      ? 'Deactivate user'
                                      : 'Reactivate user'
                                  }
                                  color={isActive ? 'error' : 'default'}
                                  onClick={() => toggleActive(u)}
                                >
                                  {isActive ? (
                                    <BlockIcon fontSize='small' />
                                  ) : (
                                    <RestoreIcon fontSize='small' />
                                  )}
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Panel>

      <AddUserDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={() => {
          setShowAdd(false);
          router.refresh();
        }}
        teamName={user.teamName}
      />

      <ChangePasswordDialog
        open={!!pwdUser}
        onClose={() => setPwdUser(null)}
        onSuccess={() => setPwdUser(null)}
        userId={pwdUser?._id ?? null}
        userName={pwdUser?.name ?? ''}
      />

      <ConfirmDialog
        confirmDialog={confirmDialog}
        setConfirmDialog={setConfirmDialog}
      />
    </Stack>
  );
}
