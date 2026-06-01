import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

/** Matches the settled ReleasesClient table row height and column structure. */
function TableRowSkeleton() {
  return (
    <TableRow>
      {/* Name + optional clone note — matches Stack spacing={0.25} + two Typography */}
      <TableCell>
        <Stack spacing={0.4}>
          <Skeleton variant='text' width='40%' height={18} />
          <Skeleton variant='text' width='24%' height={13} />
        </Stack>
      </TableCell>
      {/* Status chip — Chip size='small' ~56px wide, 20px tall */}
      <TableCell>
        <Skeleton variant='rounded' width={60} height={20} />
      </TableCell>
      {/* Environments — 1–3 env chips side by side */}
      <TableCell>
        <Stack direction='row' spacing={0.5}>
          <Skeleton variant='rounded' width={36} height={20} />
          <Skeleton variant='rounded' width={52} height={20} />
          <Skeleton variant='rounded' width={74} height={20} />
        </Stack>
      </TableCell>
      {/* Created date */}
      <TableCell>
        <Skeleton variant='text' width={80} height={18} />
      </TableCell>
      {/* Actions — three IconButton-sized circles */}
      <TableCell align='right'>
        <Stack
          direction='row'
          spacing={0.5}
          sx={{ justifyContent: 'flex-end' }}
        >
          <Skeleton variant='circular' width={28} height={28} />
          <Skeleton variant='circular' width={28} height={28} />
          <Skeleton variant='circular' width={28} height={28} />
        </Stack>
      </TableCell>
    </TableRow>
  );
}

/** Skeleton that dimensionally matches the settled ReleasesClient page. */
export default function ReleasesLoading() {
  return (
    <Stack spacing={3}>
      {/* Page header — matches Stack direction='row' justifyContent='space-between' */}
      <Stack
        direction='row'
        sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <Stack spacing={0.5}>
          {/* pageEyebrow */}
          <Skeleton variant='text' width={52} height={13} />
          {/* pageTitle */}
          <Skeleton variant='text' width={124} height={30} />
          {/* pageSub */}
          <Skeleton variant='text' width={80} height={16} />
        </Stack>
        {/* "New Release" button */}
        <Skeleton variant='rounded' width={126} height={36} />
      </Stack>

      {/* Table */}
      <TableContainer component={Paper} elevation={1}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Environments</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align='right' sx={{ width: 120 }}>
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRowSkeleton />
            <TableRowSkeleton />
            <TableRowSkeleton />
            <TableRowSkeleton />
            <TableRowSkeleton />
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
