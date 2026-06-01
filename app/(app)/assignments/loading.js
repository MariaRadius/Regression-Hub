'use client';

import { Skeleton, Stack } from '@mui/material';

function TableRowSkeleton() {
  return (
    <Stack
      direction='row'
      spacing={2}
      sx={{
        px: 2,
        py: 1.25,
        alignItems: 'center',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {/* Test case: testKey + name */}
      <Stack spacing={0.25} sx={{ flex: '0 0 240px' }}>
        <Skeleton variant='text' width={72} height={14} />
        <Skeleton variant='text' width={200} height={16} />
      </Stack>
      {/* Responsible */}
      <Skeleton
        variant='text'
        width={120}
        height={16}
        sx={{ flex: '0 0 140px' }}
      />
      {/* Scope chip */}
      <Skeleton
        variant='rounded'
        width={90}
        height={22}
        sx={{ flex: '0 0 110px' }}
      />
      {/* Assigned by */}
      <Skeleton variant='text' width={100} height={16} sx={{ flex: 1 }} />
      {/* Date */}
      <Skeleton
        variant='text'
        width={80}
        height={16}
        sx={{ flex: '0 0 100px' }}
      />
      {/* Delete icon placeholder */}
      <Skeleton
        variant='circular'
        width={28}
        height={28}
        sx={{ flexShrink: 0 }}
      />
    </Stack>
  );
}

export default function AssignmentsLoading() {
  return (
    <Stack spacing={3}>
      {/* Header skeleton — matches PageHeader direction='row' justifyContent='space-between' mb={3} */}
      <Stack
        direction='row'
        sx={{
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 3,
        }}
      >
        <Stack spacing={0.5}>
          <Skeleton variant='text' width={56} height={14} />
          <Skeleton variant='text' width={180} height={32} />
          <Skeleton variant='text' width={300} height={18} />
        </Stack>
        {/* "Assign Case" button */}
        <Skeleton variant='rounded' width={110} height={30} />
      </Stack>

      {/* Scope toggle — matches ToggleButtonGroup row */}
      <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center' }}>
        <Skeleton variant='text' width={44} height={16} />
        <Skeleton variant='rounded' width={320} height={36} />
      </Stack>

      {/* Table skeleton */}
      <Stack
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        {/* Table header */}
        <Stack
          direction='row'
          spacing={2}
          sx={{
            px: 2,
            py: 1,
            bgcolor: 'grey.100',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Skeleton
            variant='text'
            width={80}
            height={14}
            sx={{ flex: '0 0 240px' }}
          />
          <Skeleton
            variant='text'
            width={90}
            height={14}
            sx={{ flex: '0 0 140px' }}
          />
          <Skeleton
            variant='text'
            width={50}
            height={14}
            sx={{ flex: '0 0 110px' }}
          />
          <Skeleton variant='text' width={90} height={14} sx={{ flex: 1 }} />
          <Skeleton
            variant='text'
            width={40}
            height={14}
            sx={{ flex: '0 0 100px' }}
          />
          <Skeleton
            variant='circular'
            width={28}
            height={28}
            sx={{ flexShrink: 0, visibility: 'hidden' }}
          />
        </Stack>
        {/* Table rows */}
        <TableRowSkeleton />
        <TableRowSkeleton />
        <TableRowSkeleton />
        <TableRowSkeleton />
      </Stack>
    </Stack>
  );
}
