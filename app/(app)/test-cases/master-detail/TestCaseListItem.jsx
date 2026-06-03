'use client';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import FolderIcon from '@mui/icons-material/Folder';
import PersonIcon from '@mui/icons-material/Person';
import { Box, Checkbox, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { PRIORITIES, STATUS } from '@/lib/constants';

const STATUS_COLOR = {
  [STATUS.PASS]: 'success.main',
  [STATUS.FAIL]: 'error.main',
  [STATUS.PENDING]: 'warning.main',
};
const PRIORITY_BAR = {
  [PRIORITIES.HIGH]: 'error.main',
  [PRIORITIES.MEDIUM]: 'warning.main',
  [PRIORITIES.LOW]: 'text.disabled',
};

function toDisplayCase(value) {
  if (!value) return '';
  return value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function MetaChip({
  icon,
  label,
  color = 'default',
  variant = 'filled',
  sx = {},
}) {
  return (
    <Chip
      size='small'
      icon={icon}
      label={label}
      color={color}
      variant={variant}
      sx={{
        maxWidth: '100%',
        height: 24,
        borderRadius: 1.5,
        textTransform: 'none',
        fontWeight: 500,
        '& .MuiChip-label': {
          display: 'block',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          px: 1,
          textTransform: 'none',
        },
        '& .MuiChip-icon': {
          color: 'inherit',
        },
        ...sx,
      }}
    />
  );
}

/**
 * Single row in the master list. Checkbox for bulk selection + priority bar
 * + status dot + title/subtitle metadata.
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
        bgcolor: active ? 'action.hover' : 'transparent',
        alignItems: 'center',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Checkbox
        size='small'
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={onToggle}
      />
      <Tooltip
        title={tc.priority ? `Priority: ${tc.priority}` : 'Priority not set'}
      >
        <Box
          sx={{
            width: 3,
            height: 22,
            borderRadius: 1,
            bgcolor: PRIORITY_BAR[tc.priority] || 'text.disabled',
          }}
        />
      </Tooltip>
      <Tooltip title={tc.status ? `Status: ${tc.status}` : 'Status not set'}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: STATUS_COLOR[tc.status] || 'text.disabled',
          }}
        />
      </Tooltip>

      <Stack sx={{ flex: 1, minWidth: 0 }}>
        <Stack
          direction='row'
          spacing={0.5}
          sx={{ alignItems: 'baseline', overflow: 'hidden' }}
        >
          <Typography
            variant='mono'
            color='text.disabled'
            sx={{ flexShrink: 0 }}
          >
            {tc.testKey}
          </Typography>
          <Typography variant='tableCell' noWrap sx={{ flex: 1, minWidth: 0 }}>
            {tc.testCase}
          </Typography>
        </Stack>

        <Stack
          direction='row'
          spacing={0.75}
          useFlexGap
          sx={{ flexWrap: 'wrap' }}
        >
          {tc.moduleName && (
            <Tooltip title='Application / Module'>
              <span>
                <MetaChip
                  icon={<FolderIcon fontSize='small' />}
                  label={`${toDisplayCase(tc.applicationName)} / ${toDisplayCase(tc.moduleName)}`}
                  sx={{
                    bgcolor: 'grey.100',
                    color: 'text.secondary',
                  }}
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
                    ? {
                        bgcolor: '#E8F5EE',
                        color: '#1F6B45',
                      }
                    : {
                        bgcolor: '#FFF1E6',
                        color: '#9A4D12',
                      }
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
                  sx={{
                    bgcolor: 'grey.100',
                    color: 'text.secondary',
                  }}
                />
              </span>
            </Tooltip>
          )}
        </Stack>
      </Stack>
    </Stack>
  );
}
