'use client';
import CloseIcon from '@mui/icons-material/Close';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useRef, useState } from 'react';
import RichTextEditor from '@/components/RichTextEditor';
import { showToast } from '@/components/Toast';
import { createApplication as apiCreateApplication } from '@/lib/api/applications';
import { createModule as apiCreateModule } from '@/lib/api/modules';
import {
  createTestCaseForRelease,
  updateTestCaseForRelease,
} from '@/lib/api/releases';
import { PRIORITIES } from '@/lib/constants';
import { JIRA_KEY_RE } from '@/lib/schemas/testCases';
import { deriveInitial } from '@/utils/appInitial';

export const EMPTY_FORM = {
  applicationId: '',
  moduleId: '',
  testCase: '',
  type: '',
  traceability: '',
  preconditions: '',
  steps: '',
  expectedResult: '',
  priority: '',
  jiraStory: '',
};

function seedForm(tc) {
  return {
    applicationId: tc.applicationId || '',
    moduleId: tc.moduleId || '',
    type: tc.type || '',
    traceability: tc.traceability || '',
    priority: tc.priority || '',
    jiraStory: tc.jiraStory || '',
    testCase: tc.testCase || '',
    preconditions: tc.preconditions || '',
    steps: tc.steps || '',
    expectedResult: tc.expectedResult || '',
  };
}

/**
 * Unified dialog for adding and editing a test case.
 *
 * - `tc` absent (null/undefined) → Add mode
 * - `tc` present → Edit mode; shows read-only testKey and an opt-in
 *   "Reset all environments to Pending" checkbox (spec §4, default off).
 *   When checked, the update route resets every environment's result to Pending.
 *
 * Callers must pass `key={tc?._id ?? 'add'}` to drive clean remount on
 * record change instead of relying on useEffect state resets.
 *
 * @see {@link ../../TestCasesClient.jsx}
 */
export default function TestCaseDialog({
  open,
  tc,
  releaseId,
  applications,
  modules,
  onApplicationCreated,
  onModuleCreated,
  onClose,
  onSuccess,
}) {
  const isEdit = !!tc;
  const [form, setForm] = useState(() => (tc ? seedForm(tc) : EMPTY_FORM));
  const [resetAllToPending, setResetAllToPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newAppName, setNewAppName] = useState(null);
  const [newAppInitial, setNewAppInitial] = useState('');
  const [creatingApp, setCreatingApp] = useState(false);
  const newAppInputRef = useRef(null);

  const [newModuleName, setNewModuleName] = useState(null);
  const [creatingModule, setCreatingModule] = useState(false);
  const newModuleInputRef = useRef(null);

  const [dupeWarning, setDupeWarning] = useState(null);

  const isOpen = isEdit ? true : open;
  const formId = isEdit ? 'edit-test-case-form' : 'add-test-case-form';
  const jiraStoryError = Boolean(
    form.jiraStory && !JIRA_KEY_RE.test(form.jiraStory),
  );

  function handleField(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleClose() {
    setNewAppName(null);
    setNewModuleName(null);
    onClose();
  }

  async function handleCreateApp() {
    if (!newAppName?.trim()) return;
    setCreatingApp(true);
    try {
      const app = await apiCreateApplication({
        name: newAppName.trim(),
        initial: newAppInitial.trim() || undefined,
      });
      onApplicationCreated(app);
      setForm((prev) => ({ ...prev, applicationId: app._id, moduleId: '' }));
      setNewAppName(null);
      setNewAppInitial('');
      showToast(`Application "${app.name}" created`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to create application', 'error');
    } finally {
      setCreatingApp(false);
    }
  }

  async function handleSave(e, { force = false } = {}) {
    e?.preventDefault?.();
    if (jiraStoryError) return;
    if (!isEdit && (!form.applicationId || !form.moduleId)) {
      showToast('Select an application and module', 'info');
      return;
    }
    setSaving(true);
    setDupeWarning(null);
    try {
      if (isEdit) {
        const applicationName =
          applications.find((a) => a._id === form.applicationId)?.name ||
          tc.applicationName;
        const moduleName =
          modules.find((m) => m._id === form.moduleId)?.name || tc.moduleName;
        await updateTestCaseForRelease(releaseId, tc._id, {
          ...form,
          resetAllToPending,
        });
        showToast('Test case updated', 'success');
        onSuccess({
          ...tc,
          ...form,
          applicationName,
          moduleName,
          resetAllToPending,
        });
      } else {
        const applicationName = applications.find(
          (a) => a._id === form.applicationId,
        )?.name;
        const moduleName = modules.find((m) => m._id === form.moduleId)?.name;
        await createTestCaseForRelease(
          releaseId,
          { ...form, applicationName, moduleName },
          {
            ...(force ? { params: { force: 'true' } } : {}),
            suppressToastForStatus: [409],
          },
        );
        showToast('Test case added', 'success');
        onSuccess();
      }
    } catch (err) {
      if (err.status === 409 && err.payload?.duplicates?.length) {
        setDupeWarning(err.payload.duplicates);
      } else {
        showToast(err.message || 'Failed to save', 'error');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateModule() {
    if (!newModuleName.trim()) return;
    if (!form.applicationId) {
      showToast('Select an application first', 'info');
      return;
    }
    setCreatingModule(true);
    try {
      const mod = await apiCreateModule({
        name: newModuleName.trim(),
        applicationId: form.applicationId,
      });
      onModuleCreated(mod);
      setForm((prev) => ({ ...prev, moduleId: mod._id }));
      setNewModuleName(null);
      showToast(`Module "${mod.name}" created`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to create module', 'error');
    } finally {
      setCreatingModule(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth='md'
      fullWidth
      slotProps={{ paper: { sx: { maxHeight: '90vh' } } }}
    >
      <DialogTitle>
        {tc?.testKey && (
          <Typography
            variant='mono'
            sx={{ display: 'block', color: 'text.disabled', fontWeight: 400 }}
          >
            {tc.testKey}
          </Typography>
        )}
        {isEdit ? 'Edit Test Case' : 'Add Test Case'}
      </DialogTitle>
      <form id={formId} onSubmit={handleSave}>
        <DialogContent dividers>
          {dupeWarning && (
            <Alert
              severity='warning'
              sx={{ mb: 1.75 }}
              action={
                <Stack
                  direction='row'
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <Button
                    size='small'
                    color='warning'
                    variant='outlined'
                    onClick={() => handleSave(null, { force: true })}
                    disabled={saving}
                  >
                    Create anyway
                  </Button>
                  <Button size='small' onClick={() => setDupeWarning(null)}>
                    Cancel
                  </Button>
                </Stack>
              }
            >
              <Typography variant='body2' sx={{ fontWeight: 600 }}>
                Possible duplicate detected
              </Typography>
              {dupeWarning.map((d) => (
                <Typography key={d.id} variant='body2'>
                  {d.testKey ? `${d.testKey}: ` : ''}
                  {d.testCase}
                </Typography>
              ))}
            </Alert>
          )}
          {/* Application, Module, Priority, Jira Story */}
          <Grid container spacing={1.75} sx={{ mb: 1.75 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                select
                fullWidth
                size='small'
                label='Application'
                required
                name='applicationId'
                value={form.applicationId}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setForm((prev) => ({
                      ...prev,
                      applicationId: '',
                      moduleId: '',
                    }));
                    setNewModuleName(null);
                    setNewAppName('');
                    setNewAppInitial('');
                    setTimeout(() => newAppInputRef.current?.focus(), 50);
                  } else {
                    setForm((prev) => ({
                      ...prev,
                      applicationId: e.target.value,
                      moduleId: '',
                    }));
                    setNewAppName(null);
                  }
                }}
                slotProps={{
                  select: { displayEmpty: true },
                  inputLabel: { shrink: true },
                }}
              >
                <MenuItem value=''>Select application</MenuItem>
                <MenuItem value='__new__'>+ Add new application…</MenuItem>
                {applications.map((a) => (
                  <MenuItem key={a._id} value={a._id}>
                    {a.name}
                  </MenuItem>
                ))}
              </TextField>
              {newAppName !== null && (
                <Stack direction='row' spacing={0.75} sx={{ mt: 0.75 }}>
                  <TextField
                    slotProps={{ htmlInput: { ref: newAppInputRef } }}
                    size='small'
                    value={newAppName}
                    onChange={(e) => {
                      setNewAppName(e.target.value);
                      try {
                        setNewAppInitial(deriveInitial(e.target.value));
                      } catch {
                        setNewAppInitial('');
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateApp();
                      }
                    }}
                    placeholder='Application name'
                    sx={{ flex: 2 }}
                  />
                  <TextField
                    size='small'
                    label='Initial'
                    value={newAppInitial}
                    onChange={(e) =>
                      setNewAppInitial(e.target.value.toUpperCase().slice(0, 3))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateApp();
                      }
                    }}
                    placeholder='ABC'
                    sx={{ flex: 1 }}
                    slotProps={{ htmlInput: { maxLength: 3 } }}
                  />
                  <Button
                    variant='contained'
                    size='small'
                    onClick={handleCreateApp}
                    disabled={creatingApp || !newAppName.trim()}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    {creatingApp ? '…' : 'Create'}
                  </Button>
                  <IconButton
                    size='small'
                    aria-label='Cancel'
                    onClick={() => {
                      setNewAppName(null);
                      setNewAppInitial('');
                    }}
                  >
                    <CloseIcon />
                  </IconButton>
                </Stack>
              )}
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                select
                fullWidth
                size='small'
                label='Module'
                required
                name='moduleId'
                value={form.moduleId}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setForm((prev) => ({ ...prev, moduleId: '' }));
                    setNewModuleName('');
                    setTimeout(() => newModuleInputRef.current?.focus(), 50);
                  } else {
                    setForm((prev) => ({
                      ...prev,
                      moduleId: e.target.value,
                    }));
                    setNewModuleName(null);
                  }
                }}
                slotProps={{
                  select: { displayEmpty: true },
                  inputLabel: { shrink: true },
                }}
              >
                <MenuItem value=''>Select module</MenuItem>
                <MenuItem value='__new__'>+ Add new module…</MenuItem>
                {modules
                  .filter(
                    (m) =>
                      !form.applicationId ||
                      m.applicationId === form.applicationId,
                  )
                  .map((m) => (
                    <MenuItem key={m._id} value={m._id}>
                      {m.name}
                    </MenuItem>
                  ))}
              </TextField>
              {newModuleName !== null && (
                <Stack direction='row' spacing={0.75} sx={{ mt: 0.75 }}>
                  <TextField
                    slotProps={{ htmlInput: { ref: newModuleInputRef } }}
                    size='small'
                    value={newModuleName}
                    onChange={(e) => setNewModuleName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateModule();
                      }
                    }}
                    placeholder='New module name'
                    sx={{ flex: 1 }}
                  />
                  <Button
                    variant='contained'
                    size='small'
                    onClick={handleCreateModule}
                    disabled={creatingModule || !newModuleName.trim()}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    {creatingModule ? '…' : 'Create'}
                  </Button>
                  <IconButton
                    size='small'
                    aria-label='Cancel'
                    onClick={() => setNewModuleName(null)}
                  >
                    <CloseIcon />
                  </IconButton>
                </Stack>
              )}
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                select
                fullWidth
                size='small'
                label='Priority'
                name='priority'
                value={form.priority}
                onChange={handleField}
                slotProps={{
                  select: { displayEmpty: true },
                  inputLabel: { shrink: true },
                }}
              >
                <MenuItem value=''>—</MenuItem>
                <MenuItem value={PRIORITIES.HIGH}>High</MenuItem>
                <MenuItem value={PRIORITIES.MEDIUM}>Medium</MenuItem>
                <MenuItem value={PRIORITIES.LOW}>Low</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                fullWidth
                size='small'
                label='Jira Story'
                name='jiraStory'
                value={form.jiraStory}
                placeholder='e.g. RXR-123…'
                onChange={handleField}
                error={jiraStoryError}
                helperText={
                  jiraStoryError
                    ? 'Must be a valid Jira key (e.g. RXR-123)'
                    : ''
                }
                slotProps={{
                  htmlInput: { spellCheck: false, autoComplete: 'off' },
                }}
              />
            </Grid>
          </Grid>
          {/* Type, Traceability */}
          <Grid container spacing={1.75} sx={{ mb: 1.75 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                size='small'
                label='Type'
                name='type'
                value={form.type}
                placeholder='e.g. Functional'
                onChange={handleField}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                size='small'
                label='Traceability'
                name='traceability'
                value={form.traceability}
                onChange={handleField}
              />
            </Grid>
          </Grid>
          {/* Test Case */}
          <Grid container spacing={1.75} sx={{ mb: 1.75 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                size='small'
                label='Test Case'
                required
                name='testCase'
                value={form.testCase}
                onChange={handleField}
                placeholder='Describe the test case'
              />
            </Grid>
          </Grid>
          {/* Preconditions, Steps */}
          <Grid container spacing={1.75} sx={{ mb: 1.75 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography
                variant='formLabel'
                color='text.secondary'
                sx={{ display: 'block', mb: 0.5 }}
              >
                Preconditions
              </Typography>
              <RichTextEditor
                value={form.preconditions}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, preconditions: v }))
                }
                placeholder='List any preconditions…'
                minHeight={72}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography
                variant='formLabel'
                color='text.secondary'
                sx={{ display: 'block', mb: 0.5 }}
              >
                Steps
              </Typography>
              <RichTextEditor
                value={form.steps}
                onChange={(v) => setForm((prev) => ({ ...prev, steps: v }))}
                placeholder='1. Step one&#10;2. Step two…'
                minHeight={72}
              />
            </Grid>
          </Grid>
          {/* Expected Result */}
          <Stack sx={{ mb: 1.75 }}>
            <Typography
              variant='formLabel'
              color='text.secondary'
              sx={{ display: 'block', mb: 0.5 }}
            >
              Expected Result *
            </Typography>
            <RichTextEditor
              value={form.expectedResult}
              onChange={(v) =>
                setForm((prev) => ({ ...prev, expectedResult: v }))
              }
              placeholder='Describe the expected outcome…'
              minHeight={80}
            />
          </Stack>
          {/* Reset checkbox — only in edit mode */}
          {isEdit && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={resetAllToPending}
                  onChange={(e) => setResetAllToPending(e.target.checked)}
                  size='small'
                />
              }
              label={
                <Typography variant='tableCell'>
                  Reset all environments to Pending
                </Typography>
              }
              sx={{ mt: 0.5 }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button variant='outlined' onClick={handleClose}>
            Cancel
          </Button>
          <Button
            form={formId}
            type='submit'
            variant='contained'
            loading={saving}
            disabled={saving}
          >
            Save Changes
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
