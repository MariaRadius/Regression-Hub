'use client';

import {
  Box,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';

export default function UsersLoading() {
  return (
    <Stack spacing={3}>
      {/* PageHeader skeleton — matches Stack direction='row' justifyContent='space-between' mb={3} */}
      <Stack
        direction='row'
        sx={{
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 3,
        }}
      >
        <Stack spacing={0.5}>
          {/* eyebrow */}
          <Skeleton variant='text' width={48} height={14} />
          {/* h1 title */}
          <Skeleton variant='text' width={200} height={36} />
          {/* sub row: team chip + counts */}
          <Skeleton variant='rounded' width={180} height={20} />
        </Stack>
        {/* Add User button */}
        <Skeleton variant='rounded' width={100} height={32} />
      </Stack>

      {/* Panel skeleton — matches Paper variant='outlined' > PanelHeader + TableContainer */}
      <Paper variant='outlined'>
        {/* PanelHeader — matches px={2} py={1.5} borderBottom */}
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Skeleton variant='text' width={60} height={24} />
        </Box>

        <TableContainer>
          <Table size='small' stickyHeader>
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
                <TableCell sx={{ width: 44 }} />
                <TableCell>Name</TableCell>
                <TableCell>Username</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align='right'>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5'].map((key) => (
                <TableRow key={key}>
                  {/* Avatar */}
                  <TableCell sx={{ py: 1.25, px: 1.5 }}>
                    <Skeleton variant='circular' width={36} height={36} />
                  </TableCell>
                  {/* Name */}
                  <TableCell>
                    <Skeleton variant='text' width={120} height={20} />
                  </TableCell>
                  {/* Username */}
                  <TableCell>
                    <Skeleton variant='text' width={100} height={20} />
                  </TableCell>
                  {/* Role chip */}
                  <TableCell>
                    <Skeleton variant='rounded' width={56} height={22} />
                  </TableCell>
                  {/* Status chip */}
                  <TableCell>
                    <Skeleton variant='rounded' width={60} height={22} />
                  </TableCell>
                  {/* Created */}
                  <TableCell>
                    <Skeleton variant='text' width={90} height={20} />
                  </TableCell>
                  {/* Action icon buttons */}
                  <TableCell align='right'>
                    <Stack
                      direction='row'
                      spacing={0.25}
                      sx={{ justifyContent: 'flex-end' }}
                    >
                      <Skeleton variant='circular' width={28} height={28} />
                      <Skeleton variant='circular' width={28} height={28} />
                      <Skeleton variant='circular' width={28} height={28} />
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Stack>
  );
}
