'use client';
import { Box, Checkbox, Stack, Tooltip, Typography } from '@mui/material';
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
          spacing={0.5}
          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
        >
          {tc.moduleName && (
            <Tooltip title='Application / Module'>
              <Typography
                component='span'
                variant='tableCell'
                color='text.disabled'
              >
                {tc.applicationName}/{tc.moduleName} ·{' '}
              </Typography>
            </Tooltip>
          )}
          <Tooltip title='Assignee'>
            <Typography
              component='span'
              variant='tableCell'
              color={tc.assignedTo ? 'text.secondary' : 'text.disabled'}
            >
              {tc.assignedTo || 'unassigned'}
            </Typography>
          </Tooltip>
          {tc.testedBy && tc.testedBy !== tc.assignedTo && (
            <Tooltip title='Tested by'>
              <Typography
                component='span'
                variant='tableCell'
                color='text.secondary'
              >
                {' · '}tested by {tc.testedBy}
              </Typography>
            </Tooltip>
          )}
        </Stack>
      </Stack>
    </Stack>
  );
}
