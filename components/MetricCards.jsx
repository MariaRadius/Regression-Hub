import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';

/** @see components/__tests__/MetricCards.test.jsx */

const CLS_TO_PALETTE = {
  pass: 'pass.main',
  fail: 'fail.main',
  pending: 'pending.main',
};

const LABEL_TO_ACCENT = {
  'Total Test Cases': 'grey.300',
  'Pass Rate': 'pass.border',
  'Fail Rate': 'fail.border',
};

const CLS_TO_SURFACE = {
  pass: 'pass.light',
  fail: 'fail.light',
  pending: 'pending.light',
};

const LABEL_TO_SURFACE = {
  'Pass Rate': 'pass.light',
  'Fail Rate': 'fail.light',
};

const SURFACE_TO_CSS = {
  'background.paper': '#ffffff',
  'pass.light': '#e9fbf3',
  'fail.light': '#fff1f3',
  'pending.light': '#fff3e7',
};

export function resolveMetricAccent({ cls, label }) {
  return CLS_TO_PALETTE[cls] ?? LABEL_TO_ACCENT[label] ?? 'divider';
}

export function resolveMetricSurface({ cls, label }) {
  return CLS_TO_SURFACE[cls] ?? LABEL_TO_SURFACE[label] ?? 'background.paper';
}

/**
 * Renders a responsive row of metric summary cards.
 * Cards fill the row equally on md+, 2-col on sm, 1-col on xs.
 *
 * @param {{ cards: Array<{ label: string, value: number|string, cls?: string, sub?: string }>, loading?: boolean }} props
 * @see components/__tests__/MetricCards.test.jsx
 */
export default function MetricCards({ cards, loading = false }) {
  return (
    <Grid container spacing={2}>
      {cards.map(({ label, value, cls, sub }) => {
        const surfaceKey = resolveMetricSurface({ cls, label });
        const surfaceColor = SURFACE_TO_CSS[surfaceKey];
        const accentColor = resolveMetricAccent({ cls, label });

        return (
          <Grid key={label} size={{ xs: 12, sm: 4, md: 'grow' }}>
            <Card
              variant='outlined'
              data-testid='metric-card'
              sx={{
                height: '100%',
                position: 'relative',
                overflow: 'hidden',
                borderColor: accentColor,
                backgroundColor: surfaceKey,
                boxShadow: 1,
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  top: -36,
                  right: -28,
                  width: 108,
                  height: 108,
                  borderRadius: '50%',
                  background: `radial-gradient(circle at center, rgba(255,255,255,0.92) 0%, ${surfaceColor} 72%)`,
                  opacity: 0.7,
                },
              }}
            >
              <CardContent sx={{ position: 'relative', zIndex: 1 }}>
                <Typography variant='metricLabel' color='text.secondary'>
                  {label}
                </Typography>
                {loading ? (
                  <Skeleton
                    variant='text'
                    width={60}
                    height={36}
                    data-testid='metric-skeleton'
                  />
                ) : (
                  <Typography variant='metricValue'>{value}</Typography>
                )}
                {sub && (
                  <Typography variant='metricSub' color='text.secondary'>
                    {sub}
                  </Typography>
                )}
              </CardContent>
              <Box
                sx={{
                  height: 4,
                  bgcolor: accentColor,
                  borderRadius: '0 0 10px 10px',
                }}
              />
            </Card>
          </Grid>
        );
      })}
    </Grid>
  );
}
