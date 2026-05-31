import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';

/**
 * Displays the current software version in a styled badge.
 * Returns null when no version is available.
 *
 * @param {object} props
 * @param {string} [props.version] - Version string to display
 */
export default function VersionBadge({ version }) {
  if (!version) return null;

  return (
    <Stack
      direction='row'
      spacing={1}
      sx={{
        alignItems: 'center',
        bgcolor: 'action.hover',
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        px: 1.75,
        py: 1,
        fontSize: 13,
      }}
    >
      <Box component='span' sx={{ color: 'text.disabled', fontWeight: 500 }}>
        Current Version
      </Box>
      <Box
        component='span'
        sx={{
          bgcolor: 'action.hover',
          border: 1,
          borderColor: 'primary.main',
          borderRadius: 1.5,
          px: 1.25,
          py: 0.25,
          fontWeight: 700,
          fontFamily: 'monospace',
          color: 'primary.main',
          fontSize: 13,
        }}
      >
        {version}
      </Box>
    </Stack>
  );
}
