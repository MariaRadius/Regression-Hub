import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Panel from '@/components/Panel';

export default function TestRunsLoading() {
  return (
    <Stack spacing={3}>
      {/* Header skeleton */}
      <Stack spacing={0.75}>
        <Skeleton variant='text' width={60} height={14} />
        <Skeleton variant='text' width={160} height={28} />
        <Skeleton variant='text' width={240} height={18} />
      </Stack>

      {/* Table skeleton */}
      <Panel title='Import History'>
        <TableContainer>
          <Table size='small' aria-label='Import history'>
            <TableHead
              sx={{
                '& th': {
                  bgcolor: 'action.selected',
                  borderBottomWidth: 2,
                  borderBottomColor: 'divider',
                },
              }}
            >
              <TableRow>
                {[
                  'File Name',
                  'Environment',
                  'Version',
                  'Imported',
                  'Updated',
                  'Imported On',
                  'Report',
                ].map((col) => (
                  <TableCell key={col} scope='col'>
                    {col}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows have no meaningful key
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton variant='text' width={180} />
                  </TableCell>
                  <TableCell>
                    <Skeleton variant='rounded' width={80} height={24} />
                  </TableCell>
                  <TableCell>
                    <Skeleton variant='rounded' width={56} height={24} />
                  </TableCell>
                  <TableCell>
                    <Skeleton variant='text' width={48} />
                  </TableCell>
                  <TableCell>
                    <Skeleton variant='text' width={32} />
                  </TableCell>
                  <TableCell>
                    <Skeleton variant='text' width={120} />
                  </TableCell>
                  <TableCell>
                    <Skeleton variant='rounded' width={88} height={28} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Panel>
    </Stack>
  );
}
