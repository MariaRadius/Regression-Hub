import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/**
 * Page-level header with optional eyebrow, title, sub-text, and actions slot.
 *
 * @see {@link __tests__/PageHeader.test.jsx}
 */
export default function PageHeader({ eyebrow, title, sub, actions }) {
  const header = (
    <Stack spacing={0.5} sx={{ mb: actions ? 0 : 3 }} suppressHydrationWarning>
      {eyebrow && <Typography variant='pageEyebrow'>{eyebrow}</Typography>}
      <Typography variant='pageTitle'>{title}</Typography>
      {sub && (
        <Typography variant='pageSub' component='div'>
          {sub}
        </Typography>
      )}
    </Stack>
  );

  if (!actions) return header;

  return (
    <Stack
      direction='row'
      spacing={1.5}
      suppressHydrationWarning
      sx={{
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        mb: 3,
      }}
    >
      {header}
      {actions}
    </Stack>
  );
}
