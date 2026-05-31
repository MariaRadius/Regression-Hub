import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';

/**
 * Renders a monospaced version badge (e.g. "v1.2.3") or an em-dash placeholder when
 * no version is provided.
 *
 * @param {object} props
 * @param {string|null|undefined} props.version - Raw version string without the "v" prefix.
 */
export default function VersionChip({ version }) {
  if (!version) {
    return (
      <Typography variant='tableCell' color='text.disabled'>
        —
      </Typography>
    );
  }

  return (
    <Chip
      label={`v${version}`}
      size='small'
      color='primary'
      variant='outlined'
      sx={{
        '& .MuiChip-label': { fontFamily: 'var(--font-mono)', fontWeight: 700 },
      }}
    />
  );
}
