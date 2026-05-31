'use client';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
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
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';

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
  onToggleAll,
  onAction,
}) {
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
        <Divider orientation='vertical' flexItem />
        <Button
          size='small'
          startIcon={<SwapHorizIcon />}
          onClick={() => onAction('reassign')}
        >
          Reassign
        </Button>
        <Button
          size='small'
          startIcon={<EditIcon />}
          onClick={() => onAction('edit')}
        >
          Edit
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
        placeholder='Search test cases…'
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position='start'>
                <SearchIcon fontSize='small' />
              </InputAdornment>
            ),
          },
        }}
      />
      <Tooltip title='Sort'>
        <IconButton size='small' aria-label='Sort test cases'>
          <SwapVertIcon fontSize='small' />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}
