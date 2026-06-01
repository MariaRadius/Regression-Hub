'use client';

import { Autocomplete, TextField } from '@mui/material';
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
        minWidth: { xs: 150, sm: 190 },
        maxWidth: 260,
        '& .MuiOutlinedInput-root': {
          bgcolor: 'rgba(255,255,255,0.06)',
          color: 'white',
          '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
          '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
          '&.Mui-focused fieldset': { borderColor: 'primary.main' },
        },
        '& .MuiAutocomplete-popupIndicator': {
          color: 'rgba(255,255,255,0.5)',
        },
        '& .MuiInputBase-input': {
          fontSize: 13,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
      }}
      slotProps={{
        paper: {
          sx: {
            bgcolor: 'nav.light',
            color: 'white',
            '& .MuiAutocomplete-option': {
              fontSize: 13,
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
    />
  );
}
