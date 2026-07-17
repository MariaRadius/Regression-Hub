'use client';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import {
  Alert,
  Autocomplete,
  Button,
  Card,
  CardContent,
  CardHeader,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { createApplication } from '@/lib/api/applications';
import { createModule } from '@/lib/api/modules';
import { deriveInitial } from '@/utils/appInitial';
import { getInvalidKeys, parseStoryKeys } from '@/utils/jiraStories';

/**
 * Page-level form for entering Jira story keys + app/module and triggering
 * AI test-case generation. Mirrors the SetupPhase inside AITestCaseSlidesDialog
 * but renders as a Card instead of dialog content.
 *
 * @param {{
 *   applications: Array<{ _id: string, name: string, initial: string }>,
 *   modules: Array<{ _id: string, name: string, applicationId: string }>,
 *   onApplicationCreated: (app: object) => void,
 *   onModuleCreated: (mod: object) => void,
 *   initialStoryKey: string,
 *   onGenerate: (combinations: Array<{ key: string, app: object, moduleId: string, moduleName: string }>) => void,
 *   aiConfigured: boolean,
 * }} props
 */
export default function GenerateStoryForm({
  applications,
  modules,
  onApplicationCreated,
  onModuleCreated,
  initialStoryKey,
  onGenerate,
  aiConfigured,
  releaseSelected = true,
}) {
  const [storyKeysRaw, setStoryKeysRaw] = useState(initialStoryKey || '');
  const [selectedApps, setSelectedApps] = useState([]);
  const [selectedModuleId, setSelectedModuleId] = useState('');

  const [newAppName, setNewAppName] = useState(null);
  const [newAppInitial, setNewAppInitial] = useState('');
  const [creatingApp, setCreatingApp] = useState(false);
  const [appError, setAppError] = useState(null);
  const newAppInputRef = useRef(null);

  const [newModuleName, setNewModuleName] = useState(null);
  const [creatingModule, setCreatingModule] = useState(false);
  const [moduleError, setModuleError] = useState(null);
  const newModuleInputRef = useRef(null);

  // Sync story key when parent pre-fills from Jira panel click
  useEffect(() => {
    if (initialStoryKey) setStoryKeysRaw(initialStoryKey);
  }, [initialStoryKey]);

  const parsedKeys = parseStoryKeys(storyKeysRaw);
  const invalidKeys = getInvalidKeys(storyKeysRaw);
  const appIds = new Set(selectedApps.map((a) => a._id));
  const availableModules = modules.filter((m) => appIds.has(m.applicationId));
  const combinationCount = parsedKeys.length * selectedApps.length;

  const allValid =
    parsedKeys.length > 0 &&
    selectedApps.length > 0 &&
    !!selectedModuleId &&
    invalidKeys.length === 0 &&
    releaseSelected;

  function handleAppsChange(_, newApps) {
    if (newApps.some((a) => a._id === '__new__')) {
      setNewAppName('');
      setTimeout(() => newAppInputRef.current?.focus(), 50);
      return;
    }
    setSelectedApps(newApps);
    if (selectedModuleId) {
      const newAppIds = new Set(newApps.map((a) => a._id));
      const stillValid = modules.some(
        (m) => m._id === selectedModuleId && newAppIds.has(m.applicationId),
      );
      if (!stillValid) setSelectedModuleId('');
    }
  }

  async function handleCreateApp() {
    if (!newAppName?.trim()) return;
    setCreatingApp(true);
    setAppError(null);
    try {
      const app = await createApplication({
        name: newAppName.trim(),
        initial: newAppInitial.trim() || undefined,
      });
      onApplicationCreated(app);
      setSelectedApps((prev) => [...prev, app]);
      setNewAppName(null);
      setNewAppInitial('');
    } catch (err) {
      setAppError(err.message || 'Failed to create application');
    } finally {
      setCreatingApp(false);
    }
  }

  async function handleCreateModule() {
    if (!newModuleName?.trim() || !selectedApps[0]) return;
    setCreatingModule(true);
    setModuleError(null);
    try {
      const mod = await createModule({
        name: newModuleName.trim(),
        applicationId: selectedApps[0]._id,
      });
      onModuleCreated(mod);
      setSelectedModuleId(mod._id);
      setNewModuleName(null);
    } catch (err) {
      setModuleError(err.message || 'Failed to create module');
    } finally {
      setCreatingModule(false);
    }
  }

  function handleGenerate() {
    if (!allValid) return;
    const modName = modules.find((m) => m._id === selectedModuleId)?.name ?? '';
    const combinations = parsedKeys.flatMap((key) =>
      selectedApps.map((app) => ({
        key,
        app,
        moduleId: selectedModuleId,
        moduleName: modName,
      })),
    );
    onGenerate(combinations);
  }

  return (
    <Card
      variant='outlined'
      sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <CardHeader
        avatar={<AutoAwesomeIcon color='primary' />}
        title='Generate from Story'
        slotProps={{ title: { variant: 'subtitle2' } }}
      />
      <CardContent sx={{ flex: 1 }}>
        <Stack spacing={2}>
          <Alert severity='info'>
            Enter one or more Jira story keys and select the applications to
            test against. For related stories that span multiple apps, the AI
            generates test cases for each story × app pair, one at a time.
          </Alert>

          <TextField
            label='Story Keys'
            placeholder='e.g. SCRUM-8, PROJ-123'
            size='small'
            fullWidth
            value={storyKeysRaw}
            onChange={(e) => setStoryKeysRaw(e.target.value.toUpperCase())}
            error={invalidKeys.length > 0}
            helperText={
              invalidKeys.length > 0
                ? `Invalid: ${invalidKeys.join(', ')} — use PROJECT-123 format`
                : `Comma- or space-separated, up to 10${parsedKeys.length > 0 ? ` (${parsedKeys.length} valid)` : ''}`
            }
          />

          <Autocomplete
            multiple
            size='small'
            options={[
              ...applications,
              { _id: '__new__', name: '+ New application' },
            ]}
            getOptionLabel={(o) => o.name}
            value={selectedApps}
            onChange={handleAppsChange}
            renderInput={(params) => (
              <TextField {...params} label='Application' />
            )}
          />

          {newAppName !== null && (
            <Stack spacing={1}>
              <TextField
                slotProps={{ htmlInput: { ref: newAppInputRef } }}
                size='small'
                label='New application name'
                value={newAppName}
                onChange={(e) => {
                  setNewAppName(e.target.value);
                  try {
                    setNewAppInitial(deriveInitial(e.target.value));
                  } catch {
                    setNewAppInitial('');
                  }
                }}
                error={!!appError}
                helperText={appError}
              />
              <TextField
                size='small'
                label='3-letter prefix'
                value={newAppInitial}
                onChange={(e) =>
                  setNewAppInitial(e.target.value.toUpperCase().slice(0, 3))
                }
              />
              <Stack direction='row' spacing={1}>
                <Button
                  size='small'
                  onClick={handleCreateApp}
                  disabled={creatingApp}
                >
                  {creatingApp ? 'Creating…' : 'Create'}
                </Button>
                <Button size='small' onClick={() => setNewAppName(null)}>
                  Cancel
                </Button>
              </Stack>
            </Stack>
          )}

          <TextField
            select
            size='small'
            label='Module'
            fullWidth
            value={selectedModuleId}
            onChange={(e) => {
              if (e.target.value === '__new__') {
                setSelectedModuleId('');
                setNewModuleName('');
                setTimeout(() => newModuleInputRef.current?.focus(), 50);
              } else {
                setSelectedModuleId(e.target.value);
                setNewModuleName(null);
              }
            }}
            disabled={selectedApps.length === 0}
            slotProps={{
              select: { displayEmpty: true },
              inputLabel: { shrink: true },
            }}
          >
            <MenuItem value=''>Select a module</MenuItem>
            {availableModules.map((m) => (
              <MenuItem key={m._id} value={m._id}>
                {m.name}
              </MenuItem>
            ))}
            {selectedApps.length === 1 && (
              <MenuItem value='__new__'>+ New module</MenuItem>
            )}
          </TextField>

          {newModuleName !== null && (
            <Stack spacing={1}>
              <TextField
                slotProps={{ htmlInput: { ref: newModuleInputRef } }}
                size='small'
                label='New module name'
                value={newModuleName}
                onChange={(e) => setNewModuleName(e.target.value)}
                error={!!moduleError}
                helperText={moduleError}
              />
              <Stack direction='row' spacing={1}>
                <Button
                  size='small'
                  onClick={handleCreateModule}
                  disabled={creatingModule}
                >
                  {creatingModule ? 'Creating…' : 'Create'}
                </Button>
                <Button size='small' onClick={() => setNewModuleName(null)}>
                  Cancel
                </Button>
              </Stack>
            </Stack>
          )}

          {combinationCount > 0 && (
            <Typography variant='caption' color='text.secondary'>
              Will generate {combinationCount} combination
              {combinationCount > 1 ? 's' : ''} ({parsedKeys.length} stor
              {parsedKeys.length > 1 ? 'ies' : 'y'} × {selectedApps.length} app
              {selectedApps.length > 1 ? 's' : ''})
            </Typography>
          )}

          <Tooltip
            title={
              !releaseSelected
                ? 'Select a release from the top bar to use this feature'
                : !aiConfigured
                  ? 'Configure an AI provider in Admin → Settings to enable this feature'
                  : ''
            }
          >
            <span>
              <Button
                variant='contained'
                fullWidth
                disabled={!allValid || !aiConfigured}
                onClick={handleGenerate}
              >
                {allValid
                  ? `Generate test cases (${combinationCount})`
                  : 'Generate Test Cases'}
              </Button>
            </span>
          </Tooltip>

          {!aiConfigured && (
            <Typography
              variant='caption'
              color='text.secondary'
              sx={{ textAlign: 'center' }}
            >
              AI not configured — go to Admin → Settings to enable generation.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
