'use client';
import { Box, Checkbox, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { PRIORITIES, STATUS } from '@/lib/constants';
import { formatTcId } from '@/utils/formatters';

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
const META_CHIP_SX = {
  height: 18,
  borderRadius: 1,
  bgcolor: 'background.paper',
  borderColor: 'divider',
  color: 'text.secondary',
  '& .MuiChip-label': {
    px: 0.6,
    fontSize: 11,
    fontWeight: 500,
    lineHeight: 1.2,
    textTransform: 'none',
  },
};

function MetadataChip({ label, value, color = 'text.secondary', empty }) {
  return (
    <Chip
      aria-label={label}
      variant='outlined'
      size='small'
      label={value}
      sx={{
        ...META_CHIP_SX,
        color,
        borderColor: empty ? 'pending.border' : 'divider',
        bgcolor: empty ? 'pending.light' : 'background.paper',
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

      <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
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
            {formatTcId(tc)}
          </Typography>
          <Typography variant='tableCell' noWrap sx={{ flex: 1, minWidth: 0 }}>
            {tc.testCase}
          </Typography>
        </Stack>

        <Stack
          direction='row'
          spacing={0.75}
          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
        >
          {tc.moduleName && (
            <MetadataChip
              label='Application and module'
              value={`${tc.applicationName} / ${tc.moduleName}`}
              color='text.primary'
            />
          )}
          <MetadataChip
            label='Assignee'
            value={tc.assignedTo || 'Unassigned'}
            color={tc.assignedTo ? 'text.secondary' : 'pending.main'}
            empty={!tc.assignedTo}
          />
          {tc.testedBy && tc.testedBy !== tc.assignedTo && (
            <MetadataChip
              label='Tester'
              value={tc.testedBy}
              color='success.main'
            />
          )}
        </Stack>
      </Stack>
    </Stack>
  );
}
