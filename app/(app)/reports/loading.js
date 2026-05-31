import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import PageHeader from '@/components/PageHeader';
import Panel from '@/components/Panel';

export default function ReportsLoading() {
  return (
    <Stack spacing={3}>
      {/* PageHeader skeleton */}
      <PageHeader
        eyebrow={<Skeleton variant='text' width={60} height={14} />}
        title={<Skeleton variant='text' width={100} height={36} />}
        sub={<Skeleton variant='text' width={280} height={16} />}
      />

      {/* Version History panel skeleton */}
      <Panel
        title={<Skeleton variant='text' width={140} height={28} />}
        headerActions={
          <Stack direction='row' spacing={1}>
            <Skeleton variant='rounded' width={160} height={36} />
            <Skeleton variant='rounded' width={160} height={36} />
          </Stack>
        }
      >
        <Stack>
          {[1, 2, 3].map((n) => (
            <Stack
              key={n}
              direction='row'
              spacing={2}
              sx={{
                px: 2.5,
                py: 1.5,
                borderBottom: n < 3 ? 1 : 0,
                borderColor: 'divider',
                alignItems: 'center',
              }}
            >
              <Skeleton variant='rounded' width={100} height={22} />
              <Skeleton variant='text' width={36} sx={{ ml: 1 }} />
              <Skeleton variant='text' width={36} />
              <Skeleton variant='text' width={36} />
              <Skeleton variant='text' width={36} />
              <Skeleton
                variant='rounded'
                width={90}
                height={14}
                sx={{ ml: 'auto' }}
              />
            </Stack>
          ))}
        </Stack>
      </Panel>

      {/* Custom Export panel skeleton */}
      <Panel title={<Skeleton variant='text' width={120} height={28} />}>
        <Stack spacing={1.75} sx={{ p: 2.5 }}>
          <Stack direction='row' spacing={1.75}>
            <Skeleton variant='rounded' height={56} sx={{ flex: 1 }} />
            <Skeleton variant='rounded' height={56} sx={{ flex: 1 }} />
            <Skeleton variant='rounded' height={56} sx={{ flex: 1 }} />
          </Stack>
          <Stack direction='row' spacing={1.25}>
            <Skeleton variant='rounded' width={128} height={36} />
            <Skeleton variant='rounded' width={168} height={36} />
          </Stack>
        </Stack>
      </Panel>
    </Stack>
  );
}
