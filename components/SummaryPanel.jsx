import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Panel from '@/components/Panel';
import SummaryRow from '@/components/SummaryRow';

/**
 * A Panel containing a sorted list of SummaryRow entries for a group map.
 *
 * @param {string}  title            - Panel heading.
 * @param {Object}  groups           - Map of `name → { passed, failed, pending, total }`.
 * @param {'name'|'total'} [sortBy]  - Sort strategy: alphabetical by name (default) or
 *                                     descending by total count.
 * @param {{ passed: number, failed: number, pending: number }} [headerStats]
 *   - When provided, renders labeled aggregate counts in the panel header (right side).
 */
export default function SummaryPanel({
  title,
  groups,
  sortBy = 'name',
  headerStats,
}) {
  const entries = Object.entries(groups);

  const sorted =
    sortBy === 'total'
      ? [...entries].sort(([, a], [, b]) => b.total - a.total)
      : [...entries].sort(([a], [b]) => a.localeCompare(b));

  const statsRow = headerStats ? (
    <Stack direction='row' spacing={2}>
      {[
        { count: headerStats.passed, label: 'Pass', color: 'pass.main' },
        { count: headerStats.failed, label: 'Fail', color: 'fail.main' },
        { count: headerStats.pending, label: 'Pending', color: 'pending.main' },
      ].map(({ count, label, color }) => (
        <Stack
          key={label}
          direction='row'
          spacing={0.5}
          sx={{ alignItems: 'baseline' }}
        >
          <Typography
            sx={{ color, fontWeight: 700, fontSize: 13, lineHeight: 1 }}
          >
            {count}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>
            {label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  ) : undefined;

  return (
    <Panel title={title} headerActions={statsRow}>
      {entries.length ? (
        <List disablePadding>
          {sorted.map(([name, g]) => (
            <ListItemButton key={name}>
              <SummaryRow
                name={name}
                passed={g.passed}
                failed={g.failed}
                pending={g.pending}
                total={g.total}
              />
            </ListItemButton>
          ))}
        </List>
      ) : (
        <Stack sx={{ py: 5, alignItems: 'center' }}>
          <Typography variant='emptyStateTitle' color='text.disabled'>
            No data
          </Typography>
        </Stack>
      )}
    </Panel>
  );
}
