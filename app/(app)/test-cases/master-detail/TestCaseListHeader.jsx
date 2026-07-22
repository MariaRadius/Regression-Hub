'use client';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import SearchIcon from '@mui/icons-material/Search';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import {
  Button,
  Checkbox,
  Divider,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';

const SORT_OPTIONS = [
  { sortBy: 'createdAt', sortDir: 'asc', label: 'Oldest first' },
  { sortBy: 'createdAt', sortDir: 'desc', label: 'Newest first' },
  { sortBy: 'testCase', sortDir: 'asc', label: 'Title A-Z' },
  { sortBy: 'testCase', sortDir: 'desc', label: 'Title Z-A' },
  { sortBy: 'assignedTo', sortDir: 'asc', label: 'Assignee A-Z' },
  { sortBy: 'assignedTo', sortDir: 'desc', label: 'Assignee Z-A' },
];

/**
 * List header that swaps between default (search) mode and Gmail-style bulk
 * toolbar when rows are selected.
 *
 * @see app/(app)/test-cases/master-detail/TestCaseList.jsx
 */
export default function TestCaseListHeader({
  selectedCount,
  allOnPage,
  someOnPage,
  search,
  onSearchChange,
  sortBy,
  sortDir,
  onSortChange,
  onToggleAll,
  onAction,
}) {
  const [sortAnchor, setSortAnchor] = useState(null);
  const activeSortLabel = useMemo(
    () =>
      SORT_OPTIONS.find(
        (option) => option.sortBy === sortBy && option.sortDir === sortDir,
      )?.label || 'Oldest first',
    [sortBy, sortDir],
  );

  if (selectedCount > 0) {
    return (
      <Stack
        direction='row'
        spacing={1}
        sx={{
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Checkbox
          size='small'
          checked={allOnPage}
          indeterminate={someOnPage}
          onChange={(e) => onToggleAll(e.target.checked)}
        />
        <Typography
          variant='tableCell'
          color='primary.main'
          sx={{ fontWeight: 600 }}
        >
          {selectedCount} selected
        </Typography>
        <Divider orientation='vertical' flexItem />
        <Button
          size='small'
          color='success'
          startIcon={<CheckIcon />}
          onClick={() => onAction('pass')}
        >
          Pass
        </Button>
        <Button
          size='small'
          color='error'
          startIcon={<CloseIcon />}
          onClick={() => onAction('fail')}
        >
          Fail
        </Button>
        <Button
          size='small'
          startIcon={<RadioButtonUncheckedIcon />}
          onClick={() => onAction('pending')}
        >
          Pending
        </Button>
        <Tooltip title='Reclassify failed cases as a tracked known issue'>
          <Button
            size='small'
            color='info'
            startIcon={<BugReportOutlinedIcon />}
            onClick={() => onAction('known-issue')}
          >
            Known Issue
          </Button>
        </Tooltip>
        <Divider orientation='vertical' flexItem />
        <Button
          size='small'
          startIcon={<SwapHorizIcon />}
          onClick={() => onAction('reassign')}
        >
          Reassign
        </Button>
      </Stack>
    );
  }

  return (
    <Stack
      direction='row'
      spacing={1}
      sx={{
        px: 2,
        py: 1,
        borderBottom: 1,
        borderColor: 'divider',
        alignItems: 'center',
      }}
    >
      <Checkbox
        size='small'
        checked={allOnPage}
        onChange={(e) => onToggleAll(e.target.checked)}
      />
      <TextField
        size='small'
        fullWidth
        placeholder='Search by ID, title, application, module, assignee, or Jira story…'
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        sx={{
          '& .MuiInputBase-input': {
            fontSize: '0.875rem',
          },
        }}
        slotProps={{
          htmlInput: {
            'aria-label':
              'Search test cases by ID, title, application, module, or assignee',
          },
          input: {
            startAdornment: (
              <InputAdornment position='start'>
                <SearchIcon fontSize='small' />
              </InputAdornment>
            ),
          },
        }}
      />
      <Tooltip title={`Sort: ${activeSortLabel}`}>
        <IconButton
          size='small'
          aria-label='Sort test cases'
          onClick={(event) => setSortAnchor(event.currentTarget)}
        >
          <SwapVertIcon fontSize='small' />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={sortAnchor}
        open={Boolean(sortAnchor)}
        onClose={() => setSortAnchor(null)}
      >
        {SORT_OPTIONS.map((option) => {
          const selected =
            option.sortBy === sortBy && option.sortDir === sortDir;
          return (
            <MenuItem
              key={`${option.sortBy}-${option.sortDir}`}
              selected={selected}
              onClick={() => {
                onSortChange({
                  sortBy: option.sortBy,
                  sortDir: option.sortDir,
                });
                setSortAnchor(null);
              }}
              sx={{ fontSize: '0.875rem' }}
            >
              {option.label}
            </MenuItem>
          );
        })}
      </Menu>
    </Stack>
  );
}
