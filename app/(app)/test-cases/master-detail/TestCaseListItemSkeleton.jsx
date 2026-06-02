import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

/**
 * Loading placeholder mirroring TestCaseListItem's layout: checkbox, priority bar,
 * status dot, and a two-line text block. Width props vary per row so a stack of
 * these reads as real content rather than a uniform bar grid.
 *
 * @see app/(app)/test-cases/master-detail/TestCaseListItem.jsx
 */
export default function TestCaseListItemSkeleton({
  titleWidth = '55%',
  metaWidth = '38%',
}) {
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
