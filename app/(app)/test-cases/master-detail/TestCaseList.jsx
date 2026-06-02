'use client';
import { Box, CircularProgress, Fade, Stack } from '@mui/material';
import EmptyState from '@/components/EmptyState';
import TestCaseListHeader from './TestCaseListHeader';
import TestCaseListItem from './TestCaseListItem';
import TestCaseListItemSkeleton from './TestCaseListItemSkeleton';
import TestCasePagination from './TestCasePagination';

const SKELETON_ROWS = [
  { id: 'sk0', titleWidth: '62%', metaWidth: '44%' },
  { id: 'sk1', titleWidth: '48%', metaWidth: '36%' },
  { id: 'sk2', titleWidth: '70%', metaWidth: '52%' },
  { id: 'sk3', titleWidth: '55%', metaWidth: '40%' },
  { id: 'sk4', titleWidth: '64%', metaWidth: '30%' },
  { id: 'sk5', titleWidth: '42%', metaWidth: '48%' },
  { id: 'sk6', titleWidth: '58%', metaWidth: '38%' },
  { id: 'sk7', titleWidth: '66%', metaWidth: '43%' },
];

/**
 * Master list panel: header (search/bulk toolbar) + scrollable item list + pagination footer.
 *
 * @see hooks/useTestCaseSelection.js
 */
export default function TestCaseList({
  cases,
  loading,
  totalCount,
  activeId,
  onSelectActive,
  selection,
  search,
  onSearchChange,
  onAction,
  page,
  size,
  sizeOptions,
  onPage,
  onSize,
}) {
  return (
    <Stack sx={{ height: '100%', borderRight: 1, borderColor: 'divider' }}>
      <TestCaseListHeader
        selectedCount={selection.selected.size}
        allOnPage={selection.allOnPage}
        someOnPage={selection.someOnPage}
        search={search}
        onSearchChange={onSearchChange}
        onToggleAll={selection.toggleAll}
        onAction={onAction}
      />
      <Box sx={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {/* First-ever load with no rows yet → skeletons */}
        {loading && cases.length === 0 ? (
          <Stack>
            {SKELETON_ROWS.map((row) => (
              <TestCaseListItemSkeleton
                key={row.id}
                titleWidth={row.titleWidth}
                metaWidth={row.metaWidth}
              />
            ))}
          </Stack>
        ) : cases.length === 0 ? (
          <EmptyState title='No test cases match these filters' />
        ) : (
          <Box
            sx={{
              opacity: loading ? 0.4 : 1,
              pointerEvents: loading ? 'none' : 'auto',
              transition: 'opacity 200ms',
            }}
          >
            {cases.map((tc) => (
              <TestCaseListItem
                key={tc._id}
                tc={tc}
                selected={selection.selected.has(tc._id)}
                active={activeId === tc._id}
                onToggle={() => selection.toggleOne(tc._id)}
                onClick={() => onSelectActive(tc._id)}
              />
            ))}
          </Box>
        )}

        {/* Re-fetch overlay: spinner centered over dimmed rows */}
        <Fade in={loading && cases.length > 0}>
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <CircularProgress size={36} thickness={3} />
          </Box>
        </Fade>
      </Box>
      <TestCasePagination
        page={page}
        size={size}
        totalCount={totalCount}
        onPage={onPage}
        onSize={onSize}
        sizeOptions={sizeOptions}
      />
    </Stack>
  );
}
