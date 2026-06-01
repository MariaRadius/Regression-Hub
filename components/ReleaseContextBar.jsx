'use client';

import ArchiveIcon from '@mui/icons-material/Archive';
import {
  Autocomplete,
  Box,
  Chip,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { useCallback } from 'react';
import { useReleaseEnv } from '@/contexts/ReleaseEnvContext';

/**
 * Persistent app-wide bar rendered below the top nav.
 * Provides a release selector (Autocomplete, non-archived, newest-first, searchable)
 * and an environment ToggleButtonGroup.
 * When the active release is archived, renders a warning Chip that signals to the
 * rest of the app that mutation controls should be disabled.
 *
 * @param {{ releases: object[] }} props - Full list of non-archived releases (SSR-provided).
 */
export default function ReleaseContextBar({ releases = [] }) {
  const { activeRelease, environment, setRelease, setEnvironment } =
    useReleaseEnv();

  const isArchived = activeRelease?.archived === true;

  const handleReleaseChange = useCallback(
    (_event, newValue) => {
      if (newValue) setRelease(newValue);
    },
    [setRelease],
  );

  const handleEnvChange = useCallback(
    (_event, newEnv) => {
      // ToggleButtonGroup fires null when same button is clicked — ignore
      if (newEnv) setEnvironment(newEnv);
    },
    [setEnvironment],
  );

  return (
    <Box
      component='nav'
      aria-label='Release and environment context'
      sx={{
        bgcolor: 'nav.light',
        borderBottom: '1px solid',
        borderColor: 'rgba(255,255,255,0.07)',
        px: { xs: 2, md: 3 },
        py: 0.75,
        position: 'sticky',
        top: 64, // height of MUI AppBar Toolbar
        zIndex: (theme) => theme.zIndex.appBar - 1,
      }}
    >
      {/* Invisible Toolbar spacer kept for consistent height calculations */}
      <Stack
        direction='row'
        spacing={2}
        sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}
      >
        {/* Release selector label */}
        <Typography
          variant='metricLabel'
          sx={{ color: 'rgba(255,255,255,0.45)', flexShrink: 0 }}
        >
          Release
        </Typography>

        {/* Autocomplete release picker */}
        <Autocomplete
          options={releases}
          value={activeRelease}
          onChange={handleReleaseChange}
          getOptionLabel={(r) => r?.name ?? ''}
          isOptionEqualToValue={(opt, val) => opt?._id === val?._id}
          size='small'
          disableClearable
          sx={{
            minWidth: 200,
            maxWidth: 320,
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
            '& .MuiInputBase-input': { fontSize: 13 },
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
              placeholder='Select release…'
              variant='outlined'
            />
          )}
        />

        {/* Archived warning */}
        {isArchived && (
          <Tooltip title='This release is archived and is read-only'>
            <Chip
              icon={
                <ArchiveIcon
                  sx={{ fontSize: 14, color: 'warning.main !important' }}
                />
              }
              label='Archived — read-only'
              size='small'
              sx={{
                bgcolor: 'rgba(217,119,6,0.15)',
                color: 'warning.main',
                border: '1px solid',
                borderColor: 'rgba(217,119,6,0.35)',
                fontWeight: 600,
                fontSize: 11,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            />
          </Tooltip>
        )}

        {/* Environment toggles */}
        {activeRelease?.environments?.length > 0 && (
          <>
            <Box
              sx={{
                width: '1px',
                height: 20,
                bgcolor: 'rgba(255,255,255,0.12)',
                mx: 0.5,
                flexShrink: 0,
              }}
            />
            <Typography
              variant='metricLabel'
              sx={{ color: 'rgba(255,255,255,0.45)', flexShrink: 0 }}
            >
              Env
            </Typography>
            <ToggleButtonGroup
              value={environment}
              exclusive
              onChange={handleEnvChange}
              size='small'
              aria-label='Environment'
              sx={{
                '& .MuiToggleButton-root': {
                  color: 'rgba(255,255,255,0.55)',
                  borderColor: 'rgba(255,255,255,0.15)',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  px: 1.5,
                  py: 0.4,
                  '&.Mui-selected': {
                    bgcolor: 'primary.main',
                    color: 'white',
                    borderColor: 'primary.main',
                    '&:hover': { bgcolor: 'primary.dark' },
                  },
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.07)' },
                },
              }}
            >
              {activeRelease.environments.map((env) => (
                <ToggleButton key={env} value={env} aria-label={env}>
                  {env}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </>
        )}
      </Stack>
    </Box>
  );
}
