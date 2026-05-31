'use client';
import { Grid, MenuItem, TextField } from '@mui/material';
import { useState } from 'react';
import { bulkUpdateTestCases } from '@/lib/api/testCasesBulk';
import { PRIORITIES } from '@/lib/constants';
import { showToast } from '@/utils/showToast';
import BulkModalShell from './BulkModalShell';

const SENTINEL = '';

/**
 * Bulk edit metadata fields: applicationId, moduleId, priority, type,
 * jiraStory. Only fields changed from sentinel are sent.
 *
 * @param {object[]} applications - [{ _id, name }] list from parent page data
 * @param {object[]} modules      - [{ _id, name, applicationId }] list from parent page data
 */
export default function BulkEditModal({
  open,
  onClose,
  selection,
  applications,
  modules,
  onSuccess,
}) {
  const [applicationId, setApplicationId] = useState(SENTINEL);
  const [moduleId, setModuleId] = useState(SENTINEL);
  const [priority, setPriority] = useState(SENTINEL);
  const [type, setType] = useState(SENTINEL);
  const [jiraStory, setJiraStory] = useState(SENTINEL);
  const [loading, setLoading] = useState(false);

  const filteredModules = applicationId
    ? (modules || []).filter((m) => m.applicationId === applicationId)
    : modules || [];

  const changedFields = {
    ...(applicationId !== SENTINEL ? { applicationId } : {}),
    ...(moduleId !== SENTINEL ? { moduleId } : {}),
    ...(priority !== SENTINEL ? { priority } : {}),
    ...(type !== SENTINEL ? { type } : {}),
    ...(jiraStory !== SENTINEL ? { jiraStory } : {}),
  };
  const hasChanges = Object.keys(changedFields).length > 0;

  async function handleConfirm() {
    setLoading(true);
    try {
      await bulkUpdateTestCases({
        ids: selection.map((s) => s._id),
        fields: changedFields,
      });
      showToast(`Updated ${selection.length} cases`, 'success');
      onSuccess();
    } catch (e) {
      showToast(e.message || 'Bulk update failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <BulkModalShell
      open={open}
      onClose={onClose}
      selection={selection}
      title={`Edit ${selection.length} Cases`}
      subtitle='Only changed fields will be applied'
      confirmLabel={`Apply to ${selection.length} Cases`}
      confirmColor='primary'
      confirmDisabled={!hasChanges}
      footerLeft={
        hasChanges
          ? `${Object.keys(changedFields).length} field(s) will change`
          : 'No changes selected'
      }
      loading={loading}
      onConfirm={handleConfirm}
    >
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            select
            fullWidth
            size='small'
            label='Application'
            value={applicationId}
            onChange={(e) => {
              setApplicationId(e.target.value);
              setModuleId(SENTINEL);
            }}
          >
            <MenuItem value={SENTINEL}>— No change —</MenuItem>
            {(applications || []).map((a) => (
              <MenuItem key={a._id} value={a._id}>
                {a.name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            select
            fullWidth
            size='small'
            label='Module'
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
          >
            <MenuItem value={SENTINEL}>— No change —</MenuItem>
            {filteredModules.map((m) => (
              <MenuItem key={m._id} value={m._id}>
                {m.name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            select
            fullWidth
            size='small'
            label='Priority'
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <MenuItem value={SENTINEL}>— No change —</MenuItem>
            {Object.values(PRIORITIES).map((p) => (
              <MenuItem key={p} value={p}>
                {p}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            fullWidth
            size='small'
            label='Type'
            placeholder='— No change —'
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField
            fullWidth
            size='small'
            label='Jira Story'
            placeholder='— No change —'
            value={jiraStory}
            onChange={(e) => setJiraStory(e.target.value)}
          />
        </Grid>
      </Grid>
    </BulkModalShell>
  );
}
