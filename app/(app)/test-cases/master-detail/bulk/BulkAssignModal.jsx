'use client';
import CloseIcon from '@mui/icons-material/Close';
import {
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import { useQaUserList } from '@/hooks/useSharedData';
import { createAssignment } from '@/lib/api/assignments';
import { showToast } from '@/utils/showToast';

/**
 * Selection-independent bulk assign. Scope = all cases in the chosen
 * applications OR modules; targets the active environment or all environments.
 * Sends { applicationIds | moduleIds, releaseId, assignedTo, environments }.
 *
 * @param counts { byApplication: Record<id,number>, byModule: Record<id,number> }
 */
export default function BulkAssignModal({
  open,
  onClose,
  releaseId,
  environment,
  environments,
  applications,
  modules,
  counts,
  onSuccess,
}) {
  const { data: qaUsers = [] } = useQaUserList();
  const [scope, setScope] = useState('application'); // 'application' | 'module'
  const [picked, setPicked] = useState(() => new Set());
  const [assignedTo, setAssignedTo] = useState('');
  const [envMode, setEnvMode] = useState('active'); // 'active' | 'all'
  const [loading, setLoading] = useState(false);

  const items =
    scope === 'application' ? (applications ?? []) : (modules ?? []);
  const countMap =
    scope === 'application' ? counts?.byApplication : counts?.byModule;

  const total = useMemo(
    () => [...picked].reduce((sum, id) => sum + (countMap?.[id] ?? 0), 0),
    [picked, countMap],
  );

  function switchScope(_e, next) {
    if (!next) return;
    setScope(next);
    setPicked(new Set());
  }

  function toggle(id) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleConfirm() {
    const ids = [...picked];
    const body = {
      releaseId,
      assignedTo,
      environments: envMode === 'all' ? environments : [environment],
      ...(scope === 'application'
        ? { applicationIds: ids }
        : { moduleIds: ids }),
    };
    setLoading(true);
    try {
      const res = await createAssignment(body);
      showToast(
        `Assigned ${res.testCaseCount} cases to ${assignedTo}`,
        'success',
      );
      onSuccess?.();
    } catch (e) {
      showToast(e.message || 'Assignment failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  const confirmDisabled = picked.size === 0 || !assignedTo || loading;

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
              Bulk Assign
            </Typography>
            <Typography color='text.secondary'>
              Assign every case in the chosen applications or modules
            </Typography>
          </Stack>
          <IconButton size='small' aria-label='Close' onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2.5}>
          {/* Scope type */}
          <Stack spacing={0.75}>
            <Typography variant='formLabel'>Scope</Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size='small'
              value={scope}
              onChange={switchScope}
            >
              <ToggleButton value='application'>By Application</ToggleButton>
              <ToggleButton value='module'>By Module</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {/* Items */}
          <Stack spacing={0.75}>
            <Stack
              direction='row'
              sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <Typography variant='formLabel'>
                {scope === 'application' ? 'Applications' : 'Modules'}
              </Typography>
              <Typography variant='metricSub' color='text.disabled'>
                {picked.size ? `${picked.size} selected` : 'none selected'}
              </Typography>
            </Stack>
            <List
              dense
              disablePadding
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                maxHeight: 220,
                overflow: 'auto',
              }}
            >
              {items.length === 0 ? (
                <Typography color='text.disabled' sx={{ p: 1.5 }}>
                  No {scope === 'application' ? 'applications' : 'modules'}{' '}
                  found
                </Typography>
              ) : (
                items.map((it) => (
                  <ListItemButton
                    key={it._id}
                    onClick={() => toggle(it._id)}
                    selected={picked.has(it._id)}
                  >
                    <Checkbox
                      edge='start'
                      tabIndex={-1}
                      disableRipple
                      checked={picked.has(it._id)}
                    />
                    <ListItemText primary={it.name} />
                    <Chip size='small' label={countMap?.[it._id] ?? 0} />
                  </ListItemButton>
                ))
              )}
            </List>
          </Stack>

          {/* Assignee */}
          <TextField
            select
            fullWidth
            size='small'
            label='Assignee'
            required
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            slotProps={{
              select: { displayEmpty: true },
              inputLabel: { shrink: true },
            }}
          >
            <MenuItem value=''>Select team member…</MenuItem>
            {qaUsers.map((u) => (
              <MenuItem key={u} value={u}>
                {u}
              </MenuItem>
            ))}
          </TextField>

          {/* Environment */}
          <Stack spacing={0.75}>
            <Typography variant='formLabel'>Environment</Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size='small'
              value={envMode}
              onChange={(_e, v) => v && setEnvMode(v)}
            >
              <ToggleButton value='active'>Active ({environment})</ToggleButton>
              <ToggleButton value='all'>All environments</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Typography
          variant='pageSub'
          color='text.secondary'
          sx={{ mr: 'auto' }}
        >
          <strong>{total}</strong> cases will be assigned{' '}
          {envMode === 'all'
            ? `across all ${environments?.length ?? 0} environments`
            : `in ${environment}`}
        </Typography>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant='contained'
          loading={loading}
          disabled={confirmDisabled}
          onClick={handleConfirm}
        >
          Assign
        </Button>
      </DialogActions>
    </Dialog>
  );
}
