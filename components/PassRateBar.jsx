import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/**
 * Pass-rate progress bar with percentage label.
 *
 * @param {{ value: number, label?: string, maxWidth?: number }} props
 * @param {number} props.value - Pass rate percentage (0–100)
 * @param {string} [props.label] - aria-label override; defaults to "Pass rate: {value}%"
 * @param {number} [props.maxWidth] - Max width of the bar in px. Omit for full-width.
 */
export default function PassRateBar({ value, label, maxWidth }) {
  return (
    <Stack
      direction='row'
      spacing={0.75}
      sx={{ alignItems: 'center', justifyContent: 'center' }}
    >
      <Stack sx={{ flex: 1, ...(maxWidth ? { maxWidth } : {}) }}>
        <LinearProgress
          variant='determinate'
          value={value}
          color='success'
          aria-label={label ?? `Pass rate: ${value}%`}
          sx={{ height: 5, borderRadius: 1.5 }}
        />
      </Stack>
      <Typography variant='tableCell' sx={{ minWidth: 32 }}>
        {value}%
      </Typography>
    </Stack>
  );
}
