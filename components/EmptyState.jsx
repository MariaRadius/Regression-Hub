import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/**
 * Empty-state placeholder with optional icon, title, and body content.
 *
 * @see {@link components/__tests__/EmptyState.test.jsx}
 *
 * @param {object} props
 * @param {React.ReactElement} [props.icon] - MUI icon element (e.g. <InfoOutlined />)
 * @param {string} [props.title] - Heading text rendered with emptyStateTitle variant
 * @param {React.ReactNode} [props.children] - Body content below the title
 */
export default function EmptyState({ icon, title, children }) {
  return (
    <Stack
      spacing={1}
      sx={{ py: 5, alignItems: 'center', textAlign: 'center' }}
    >
      {icon}
      {title && (
        <Typography variant='emptyStateTitle' color='text.disabled'>
          {title}
        </Typography>
      )}
      {children}
    </Stack>
  );
}
