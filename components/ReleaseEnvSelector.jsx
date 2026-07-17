'use client';

import {
  Autocomplete,
  Chip,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useReleaseEnv } from '@/contexts/ReleaseEnvContext';

/**
 * Searchable combined release × environment dropdown rendered inside TopNav.
 * Self-contained — reads and writes active selection via useReleaseEnv(); no props needed.
 * Returns null when no releases are available.
 */
export default function ReleaseEnvSelector() {
  const { releases, activeRelease, environment, setReleaseEnv } =
    useReleaseEnv();

  if (!releases?.length) return null;

  const options = releases.flatMap((r) =>
    (r.environments ?? []).map((env) => ({
      release: r,
      env,
      key: `${r._id}::${env}`,
      label: `${r.name} / ${env}`,
    })),
  );

  const value =
    options.find(
      (o) => o.release._id === activeRelease?._id && o.env === environment,
    ) ?? null;

  return (
    <Autocomplete
      options={options}
      value={value}
      getOptionLabel={(o) => o.label}
      isOptionEqualToValue={(opt, val) => opt.key === val.key}
      onChange={(_event, option) => {
        if (option) setReleaseEnv(option.release, option.env);
      }}
      disableClearable
      size='small'
      sx={{
        minWidth: { xs: 168, sm: 224 },
        maxWidth: 296,
        '& .MuiOutlinedInput-root': {
          bgcolor: 'rgba(255,255,255,0.07)',
          color: 'white',
          borderRadius: 2.5,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
          pl: 0.5,
          '& fieldset': { borderColor: 'rgba(255,255,255,0.14)' },
          '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.28)' },
          '&.Mui-focused fieldset': { borderColor: 'primary.main' },
        },
        '& .MuiAutocomplete-popupIndicator': {
          color: 'rgba(255,255,255,0.56)',
        },
        '& .MuiInputBase-input': {
          fontSize: 13,
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
        '& .MuiAutocomplete-endAdornment': {
          '& .MuiButtonBase-root': {
            color: 'rgba(255,255,255,0.56)',
          },
        },
      }}
      slotProps={{
        paper: {
          sx: {
            bgcolor: 'nav.light',
            color: 'white',
            border: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            borderRadius: 2,
            boxShadow: '0 14px 28px rgba(15,23,42,0.28)',
            '& .MuiAutocomplete-option': {
              fontSize: 13,
              borderRadius: 1.5,
              margin: '4px 6px',
              '&[aria-selected="true"]': {
                bgcolor: 'rgba(13,148,136,0.25)',
              },
              '&.Mui-focused': { bgcolor: 'rgba(255,255,255,0.07)' },
            },
          },
        },
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder='Select context…'
          variant='outlined'
        />
      )}
      renderOption={(props, option) => (
        <li {...props} key={option.key}>
          <Stack sx={{ width: '100%' }} spacing={0.5}>
            <Typography
              variant='tableCell'
              sx={{ color: 'white', fontWeight: 600 }}
            >
              {option.release.name}
            </Typography>
            <Chip
              label={option.env}
              size='small'
              sx={{
                width: 'fit-content',
                height: 20,
                color: '#d5fbef',
                bgcolor: 'rgba(13,148,136,0.18)',
                borderRadius: 999,
                '& .MuiChip-label': {
                  px: 1,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                },
              }}
            />
          </Stack>
        </li>
      )}
    />
  );
}
