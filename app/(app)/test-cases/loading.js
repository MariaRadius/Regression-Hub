import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

function ListRowSkeleton({ titleWidth = '55%', metaWidth = '38%' }) {
  return (
    <Stack
      direction='row'
      spacing={1.5}
      sx={{
        px: 2,
        py: 1.25,
        alignItems: 'center',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {/* Checkbox */}
      <Skeleton variant='rounded' width={20} height={20} />
      {/* Priority bar */}
      <Skeleton variant='rounded' width={3} height={22} />
      {/* Status dot */}
      <Skeleton variant='circular' width={8} height={8} />
      {/* Text block */}
      <Stack sx={{ flex: 1, minWidth: 0 }} spacing={0.4}>
        <Skeleton variant='text' width={titleWidth} height={18} />
        <Skeleton variant='text' width={metaWidth} height={14} />
      </Stack>
    </Stack>
  );
}

export default function TestCasesLoading() {
  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      {/* PageHeader skeleton — matches PageHeader direction='row', justifyContent='space-between',
          alignItems='flex-start', mb={3} */}
      <Stack
        direction='row'
        sx={{
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 3,
        }}
      >
        <Stack spacing={0.75}>
          <Skeleton variant='text' width={64} height={13} />
          <Skeleton variant='text' width={148} height={30} />
          <Skeleton variant='text' width={72} height={16} />
        </Stack>
        <Skeleton variant='rounded' width={118} height={30} />
      </Stack>

      {/* FilterStrip skeleton — matches Stack spacing={1} borderBottom with px={2} on each row */}
      <Stack
        spacing={1}
        sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
      >
        {/* Row 1 — All button + preset ToggleButtonGroup */}
        <Stack direction='row' spacing={1} sx={{ alignItems: 'center', px: 2 }}>
          <Skeleton variant='rounded' width={56} height={30} />
          <Skeleton variant='rounded' width={210} height={30} />
        </Stack>
        {/* Row 2 — Add filter button (no active chips on initial load) */}
        <Stack
          direction='row'
          spacing={0.5}
          sx={{ alignItems: 'center', px: 2 }}
        >
          <Skeleton variant='rounded' width={90} height={28} />
        </Stack>
      </Stack>

      {/* TestCaseList — full width, fills remaining height */}
      <Stack
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          borderRight: 1,
          borderColor: 'divider',
        }}
      >
        {/* TestCaseListHeader — search mode */}
        <Stack
          direction='row'
          spacing={1}
          sx={{
            px: 2,
            py: 1,
            borderBottom: 1,
            borderColor: 'divider',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <Skeleton variant='rounded' width={20} height={20} />
          <Skeleton variant='rounded' sx={{ flex: 1 }} height={36} />
          <Skeleton variant='rounded' width={32} height={32} />
        </Stack>

        {/* List rows */}
        <Stack sx={{ flex: 1, overflow: 'hidden' }}>
          <ListRowSkeleton titleWidth='62%' metaWidth='44%' />
          <ListRowSkeleton titleWidth='48%' metaWidth='36%' />
          <ListRowSkeleton titleWidth='70%' metaWidth='52%' />
          <ListRowSkeleton titleWidth='55%' metaWidth='40%' />
          <ListRowSkeleton titleWidth='64%' metaWidth='30%' />
          <ListRowSkeleton titleWidth='42%' metaWidth='48%' />
          <ListRowSkeleton titleWidth='58%' metaWidth='38%' />
          <ListRowSkeleton titleWidth='66%' metaWidth='43%' />
        </Stack>

        {/* TestCasePagination footer */}
        <Stack
          direction='row'
          sx={{
            px: 2,
            py: 1,
            borderTop: 1,
            borderColor: 'divider',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          {/* "Rows X–Y of Z" label */}
          <Skeleton variant='text' width={120} height={18} />
          {/* Rows-per-page Select + Prev / page / total / Next */}
          <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
            <Skeleton variant='rounded' width={72} height={36} />
            <Skeleton variant='rounded' width={68} height={32} />
            <Skeleton variant='text' width={16} height={18} />
            <Skeleton variant='text' width={24} height={18} />
            <Skeleton variant='rounded' width={68} height={32} />
          </Stack>
        </Stack>
      </Stack>
    </Stack>
  );
}
