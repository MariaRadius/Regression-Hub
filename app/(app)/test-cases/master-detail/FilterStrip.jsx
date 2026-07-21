'use client';
import AddIcon from '@mui/icons-material/Add';
import {
  Box,
  Button,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { useCallback, useState } from 'react';
import { useQaUserList } from '@/hooks/useSharedData';
import {
  FILTER_TYPES,
  UNASSIGNED_SENTINEL,
  VIEW_PRESETS,
} from '@/lib/constants';
import AddFilterPopover from './AddFilterPopover';
import FilterChip from './FilterChip';

// Color identity per preset tab — dot, active text, active background
const PRESET_STYLES = {
  mine: {
    dotColor: '#0d9488',
    activeColor: '#0a7a70',
    activeBg: 'rgba(13,148,136,0.08)',
  },
  pending: {
    dotColor: '#d97706',
    activeColor: '#b45309',
    activeBg: 'rgba(217,119,6,0.09)',
  },
  failed: {
    dotColor: '#dc2626',
    activeColor: '#b91c1c',
    activeBg: 'rgba(220,38,38,0.08)',
  },
  'known-issues': {
    dotColor: '#7c3aed',
    activeColor: '#6d28d9',
    activeBg: 'rgba(124,58,237,0.08)',
  },
  high: {
    dotColor: '#dc2626',
    activeColor: '#b91c1c',
    activeBg: 'rgba(220,38,38,0.08)',
  },
};

function resolvePresetValue(preset, user) {
  if (preset.value === '__currentUser__') return user?.name ?? '';
  return preset.value;
}

/**
 * Filter strip: color-coded saved-view tabs + active filter chips + "+ Add filter".
 *
 * @param {object}   props.filters      Return value of useTestCaseFilters()
 * @param {object}   props.user         Session user ({ name, email, ... })
 * @param {Array}    props.applications List of { _id, name } application objects
 * @param {Array}    props.modules      List of { _id, name } module objects
 * @param {object}   props.counts       Optional { all: number } for "All" label
 * @param {boolean}  props.isAdmin      Whether the session user has the admin role
 * @param {Function} props.onBulkAssign Called when the Bulk Assign button is clicked
 */
export default function FilterStrip({
  filters,
  user,
  applications,
  modules,
  counts,
  isAdmin,
  onBulkAssign,
}) {
  const { active, setFilter, removeFilter, clearAll, valuesOf, toggleValue } =
    filters;
  const { data: qaUsers = [] } = useQaUserList();
  const [addBtnEl, setAddBtnEl] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const setAddBtnRef = useCallback((el) => setAddBtnEl(el), []);

  const selectedPresets = VIEW_PRESETS.filter((p) => {
    const resolved = resolvePresetValue(p, user);
    return resolved && valuesOf(p.key).includes(String(resolved));
  }).map((p) => p.id);

  const allActive = Object.keys(active).length === 0;

  function handlePresetChange(_e, nextSelected) {
    const added = nextSelected.filter((id) => !selectedPresets.includes(id));
    const removed = selectedPresets.filter((id) => !nextSelected.includes(id));
    [...added, ...removed].forEach((id) => {
      const preset = VIEW_PRESETS.find((p) => p.id === id);
      if (preset)
        toggleValue(preset.key, String(resolvePresetValue(preset, user)));
    });
  }

  function optionsFor(def) {
    if (def.options) return def.options;
    if (def.optionsSource === 'applications')
      return (applications ?? []).map((a) => ({ value: a._id, label: a.name }));
    if (def.optionsSource === 'modules')
      return (modules ?? []).map((m) => ({ value: m._id, label: m.name }));
    if (def.optionsSource === 'qaUsers') {
      const qaUserOptions = (qaUsers ?? []).map((u) => ({
        value: u,
        label: u,
      }));
      if (def.key === 'assignedTo') {
        return [
          { value: UNASSIGNED_SENTINEL, label: 'Unassigned' },
          ...qaUserOptions,
        ];
      }
      return qaUserOptions;
    }
    return [];
  }

  const activeKeys = Object.keys(active);

  return (
    <Stack spacing={1} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      {/* Row 1: Saved-view toggles */}
      <Stack
        direction='row'
        spacing={1}
        sx={{ alignItems: 'center', px: 2, justifyContent: 'space-between' }}
      >
        <Stack direction='row' spacing={0.75} sx={{ alignItems: 'center' }}>
          {/* "All" pill */}
          <Button
            size='small'
            disableElevation
            onClick={clearAll}
            sx={{
              borderRadius: '20px',
              border: '1px solid',
              borderColor: allActive ? 'primary.main' : 'divider',
              bgcolor: allActive ? 'rgba(13,148,136,0.10)' : 'transparent',
              color: allActive ? 'primary.main' : 'text.secondary',
              fontWeight: allActive ? 700 : 400,
              fontSize: '0.78rem',
              px: 1.5,
              py: 0.4,
              minWidth: 0,
              '&:hover': {
                bgcolor: 'rgba(13,148,136,0.08)',
                borderColor: 'primary.main',
              },
            }}
          >
            {`All${counts?.all != null ? ` (${counts.all.toLocaleString()})` : ''}`}
          </Button>

          {/* Preset pills */}
          <ToggleButtonGroup
            value={selectedPresets}
            onChange={handlePresetChange}
            size='small'
            aria-label='saved view presets'
            sx={{
              gap: 0.5,
              '& .MuiToggleButtonGroup-grouped': {
                borderRadius: '20px !important',
                border: '1px solid !important',
                borderColor: 'divider',
                mx: 0,
                px: 1.25,
                py: 0.4,
                fontSize: '0.78rem',
                fontWeight: 400,
                color: 'text.secondary',
              },
            }}
          >
            {VIEW_PRESETS.map((p) => {
              const style = PRESET_STYLES[p.id] ?? PRESET_STYLES.mine;
              const isOn = selectedPresets.includes(p.id);
              return (
                <ToggleButton
                  key={p.id}
                  value={p.id}
                  aria-label={p.label}
                  sx={{
                    gap: 0.625,
                    '&.Mui-selected': {
                      color: `${style.activeColor} !important`,
                      bgcolor: `${style.activeBg} !important`,
                      borderColor: `${style.dotColor} !important`,
                      fontWeight: 600,
                    },
                    '&:hover': {
                      bgcolor: `${style.activeBg} !important`,
                    },
                  }}
                >
                  <Box
                    component='span'
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      bgcolor: isOn ? style.dotColor : '#cbd5e1',
                      flexShrink: 0,
                      display: 'inline-block',
                    }}
                  />
                  {p.label}
                </ToggleButton>
              );
            })}
          </ToggleButtonGroup>
        </Stack>

        {isAdmin && (
          <Button size='small' variant='outlined' onClick={onBulkAssign}>
            Bulk Assign
          </Button>
        )}
      </Stack>

      {/* Row 2: Active chips + "+ Add filter" */}
      <Stack
        direction='row'
        spacing={0.5}
        sx={{ flexWrap: 'wrap', alignItems: 'center', px: 2 }}
      >
        {activeKeys.map((key) => {
          const def = FILTER_TYPES.find((f) => f.key === key);
          if (!def) return null;
          return (
            <FilterChip
              key={key}
              def={def}
              value={active[key]}
              options={optionsFor(def)}
              onChange={(v) => setFilter(key, v)}
              onRemove={() => removeFilter(key)}
            />
          );
        })}

        <Button
          ref={setAddBtnRef}
          size='small'
          startIcon={<AddIcon />}
          onClick={() => setAddOpen(true)}
        >
          Add filter
        </Button>

        {activeKeys.length > 1 && (
          <Button size='small' color='inherit' onClick={clearAll}>
            Clear all
          </Button>
        )}
      </Stack>

      <AddFilterPopover
        anchorEl={addBtnEl}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        active={active}
        getOptions={optionsFor}
        onPick={(f, value) => setFilter(f.key, value)}
      />
    </Stack>
  );
}
