'use client';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';

/**
 * Pagination controls: rows-per-page selector + prev/next navigation.
 *
 * @see hooks/useTestCasePagination.js
 */
export default function TestCasePagination({
  page,
  size,
  totalCount,
  onPage,
  onSize,
  sizeOptions,
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  const from = totalCount === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, totalCount);

  return (
    <Stack
      direction='row'
      sx={{
        px: 2,
        py: 1,
        borderTop: 1,
        borderColor: 'divider',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Typography variant='tableCell' color='text.secondary'>
        Rows {from.toLocaleString()}–{to.toLocaleString()} of{' '}
        {totalCount.toLocaleString()}
      </Typography>
      <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
        <FormControl size='small' sx={{ minWidth: 56 }}>
          <InputLabel id='rows-per-page-label'>Rows</InputLabel>
          <Select
            labelId='rows-per-page-label'
            label='Rows'
            value={size}
            onChange={(e) => onSize(Number(e.target.value))}
          >
            {sizeOptions.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          size='small'
          disabled={page <= 1}
          startIcon={<ChevronLeftIcon />}
          onClick={() => onPage(page - 1)}
        >
          Prev
        </Button>
        <Typography variant='tableCell' sx={{ fontWeight: 600 }}>
          {page}
        </Typography>
        <Typography variant='tableCell' color='text.disabled'>
          / {totalPages}
        </Typography>
        <Button
          size='small'
          disabled={page >= totalPages}
          endIcon={<ChevronRightIcon />}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </Stack>
    </Stack>
  );
}
