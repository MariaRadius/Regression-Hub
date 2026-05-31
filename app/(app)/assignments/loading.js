'use client';

import { Box, Skeleton, Stack } from '@mui/material';

function CardSkeleton() {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      {/* Priority stripe — matches Box height={4} in AssignmentCard */}
      <Skeleton
        variant='rectangular'
        height={4}
        sx={{ bgcolor: 'action.hover' }}
      />

      {/* Card body — matches Stack px={2.5} py={2} spacing={1.5} */}
      <Stack spacing={1.5} sx={{ px: 2.5, py: 2 }}>
        {/* Title row — matches Stack direction='row' justifyContent='space-between' */}
        <Stack
          direction='row'
          spacing={1.5}
          sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}
        >
          {/* Left: title + chip, meta info */}
          <Stack sx={{ flex: 1 }} spacing={0.5}>
            <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
              <Skeleton variant='text' width={220} height={22} />
              <Skeleton variant='rounded' width={56} height={22} />
            </Stack>
            <Stack direction='row' spacing={2}>
              <Skeleton variant='text' width={100} height={16} />
              <Skeleton variant='text' width={80} height={16} />
              <Skeleton variant='text' width={120} height={16} />
            </Stack>
          </Stack>

          {/* Right: "View Cases" button — always present */}
          <Skeleton
            variant='rounded'
            width={90}
            height={28}
            sx={{ flexShrink: 0 }}
          />
        </Stack>

        {/* Progress bar — matches ProgressBar: label row + LinearProgress height={6} */}
        <Stack spacing={0.5}>
          <Stack direction='row' sx={{ justifyContent: 'space-between' }}>
            <Skeleton variant='text' width={80} height={14} />
            <Skeleton variant='text' width={32} height={14} />
          </Stack>
          <Skeleton variant='rounded' height={6} sx={{ borderRadius: 1 }} />
        </Stack>
      </Stack>
    </Box>
  );
}

export default function AssignmentsLoading() {
  return (
    <Stack spacing={3}>
      {/* Header skeleton — matches PageHeader with actions:
          direction='row' justifyContent='space-between' mb={3} */}
      <Stack
        direction='row'
        sx={{
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 3,
        }}
      >
        <Stack spacing={0.5}>
          <Skeleton variant='text' width={48} height={14} />
          <Skeleton variant='text' width={180} height={32} />
          <Skeleton variant='text' width={260} height={18} />
        </Stack>
        {/* "New Assignment" button */}
        <Skeleton variant='rounded' width={140} height={30} />
      </Stack>

      {/* Tabs skeleton — height=48 matches MUI Tabs default minHeight */}
      <Stack
        direction='row'
        spacing={0}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Skeleton variant='rounded' width={120} height={48} sx={{ mr: 1 }} />
        <Skeleton variant='rounded' width={130} height={48} />
      </Stack>

      {/* Card skeletons */}
      <Stack spacing={1.75}>
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </Stack>
    </Stack>
  );
}
