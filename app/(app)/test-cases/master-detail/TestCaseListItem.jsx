'use client';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import FolderIcon from '@mui/icons-material/Folder';
import PersonIcon from '@mui/icons-material/Person';
import { Box, Checkbox, Stack, Tooltip, Typography } from '@mui/material';
import MetaChip from '@/components/MetaChip';
import { PRIORITIES, STATUS } from '@/lib/constants';

// Status encodes directly into the key badge — background + border + text per state.
// The dot indicator is removed; the badge IS the status signal.
const STATUS_BADGE = {
  [STATUS.PASS]: {
    bgcolor: '#f0faf5',
    color: '#2d7a5a',
    borderColor: '#c6e8d8',
  },
  [STATUS.FAIL]: {
    bgcolor: '#fee2e2',
    color: '#b91c1c',
    borderColor: '#fca5a5',
  },
  [STATUS.PENDING]: {
    bgcolor: '#fff8e6',
    color: '#b45309',
    borderColor: '#d97706',
  },
  [STATUS.KNOWN_ISSUE]: {
    bgcolor: '#ede9fe',
    color: '#6d28d9',
    borderColor: '#c4b5fd',
  },
};
const DEFAULT_BADGE = {
  bgcolor: '#f1f5f9',
  color: '#64748b',
  borderColor: '#e2e8f0',
};

const PRIORITY_COLOR = {
  [PRIORITIES.HIGH]: '#ef4444',
  [PRIORITIES.MEDIUM]: '#f59e0b',
  [PRIORITIES.LOW]: '#94a3b8',
};

function toDisplayCase(value) {
  if (!value) return '';
  return value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Single row in the master list. Checkbox for bulk selection + priority bar
 * + status-tinted key badge + title/subtitle metadata.
 *
 * @see app/(app)/test-cases/master-detail/TestCaseList.jsx
 */
export default function TestCaseListItem({
  tc,
  selected,
  active,
  onToggle,
  onClick,
}) {
  const badgeStyle = STATUS_BADGE[tc.status] || DEFAULT_BADGE;
  const priorityColor = PRIORITY_COLOR[tc.priority] || '#cbd5e1';

  return (
    <Stack
      data-case-id={tc._id}
      direction='row'
      spacing={1.5}
      role='button'
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      sx={{
        px: 2,
        py: 1.25,
        cursor: 'pointer',
        borderLeft: 3,
        borderColor: active ? 'primary.main' : 'transparent',
        bgcolor: active ? 'rgba(13,148,136,0.06)' : 'transparent',
        alignItems: 'center',
        transition: 'background-color 120ms ease',
        '&:hover': {
          bgcolor: active ? 'rgba(13,148,136,0.09)' : 'action.hover',
        },
      }}
    >
      <Checkbox
        size='small'
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={onToggle}
      />

      {/* Priority bar — 4px wide, colored by priority level */}
      <Tooltip
        title={tc.priority ? `Priority: ${tc.priority}` : 'Priority not set'}
      >
        <Box
          sx={{
            width: 4,
            height: 28,
            borderRadius: 1,
            bgcolor: priorityColor,
            flexShrink: 0,
          }}
        />
      </Tooltip>

      <Stack sx={{ flex: 1, minWidth: 0 }}>
        {/* Line 1: status-tinted key badge + title */}
        <Stack
          direction='row'
          spacing={0.75}
          sx={{ alignItems: 'center', overflow: 'hidden' }}
        >
          <Tooltip
            title={tc.status ? `Status: ${tc.status}` : 'Status not set'}
          >
            <Box
              component='span'
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                px: 0.875,
                py: 0.2,
                borderRadius: '5px',
                border: '1px solid',
                borderColor: badgeStyle.borderColor,
                bgcolor: badgeStyle.bgcolor,
                color: badgeStyle.color,
                fontFamily:
                  '"JetBrains Mono","Fira Code","IBM Plex Mono",monospace',
                fontSize: '0.695rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                lineHeight: 1.5,
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {tc.testKey}
            </Box>
          </Tooltip>
          <Typography variant='tableCell' noWrap sx={{ flex: 1, minWidth: 0 }}>
            {tc.testCase}
          </Typography>
        </Stack>

        {/* Line 2: module path + assignment chips */}
        <Stack
          direction='row'
          spacing={0.75}
          useFlexGap
          sx={{ flexWrap: 'wrap', mt: 0.25 }}
        >
          {tc.moduleName && (
            <Tooltip title='Application / Module'>
              <span>
                <MetaChip
                  icon={<FolderIcon fontSize='small' />}
                  label={`${toDisplayCase(tc.applicationName)} / ${toDisplayCase(tc.moduleName)}`}
                  sx={{ bgcolor: 'grey.100', color: 'text.secondary' }}
                />
              </span>
            </Tooltip>
          )}
          <Tooltip title='Assignee'>
            <span>
              <MetaChip
                icon={<AssignmentIndIcon fontSize='small' />}
                label={
                  tc.assignedTo
                    ? `Assigned: ${toDisplayCase(tc.assignedTo)}`
                    : 'Unassigned'
                }
                sx={
                  tc.assignedTo
                    ? { bgcolor: '#f0f3f9', color: '#4e5f80' }
                    : { bgcolor: '#FFF1E6', color: '#9A4D12' }
                }
              />
            </span>
          </Tooltip>
          {tc.testedBy && tc.testedBy !== tc.assignedTo && (
            <Tooltip title='Tested by'>
              <span>
                <MetaChip
                  icon={<PersonIcon fontSize='small' />}
                  label={`Tested by: ${toDisplayCase(tc.testedBy)}`}
                  sx={{ bgcolor: '#f0f3f9', color: '#4e5f80' }}
                />
              </span>
            </Tooltip>
          )}
        </Stack>
      </Stack>
    </Stack>
  );
}
