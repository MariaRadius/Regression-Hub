'use client';
import CloseIcon from '@mui/icons-material/Close';
import {
  Chip,
  Menu,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';

/**
 * Single active-filter chip. Click body to edit value; click × to remove.
 *
 * @param {object}   props
 * @param {object}   props.def       Entry from FILTER_TYPES (key, label, kind, placeholder, etc.)
 * @param {string}   props.value     Current value string (may be comma-separated for multi-select)
 * @param {Array}    props.options   Array of strings or { value, label } objects (for kind:'select')
 * @param {Function} props.onChange  Called with new value string
 * @param {Function} props.onRemove  Called when the × is clicked
 */
export default function FilterChip({
  def,
  value,
  options,
  onChange,
  onRemove,
}) {
  const [anchor, setAnchor] = useState(null);
  const [textDraft, setTextDraft] = useState(value || '');
  const open = Boolean(anchor);

  useEffect(() => setTextDraft(value || ''), [value]);

  const displayValue = (() => {
    if (value === null || value === undefined || value === '') return '—';
    const match = options?.find((o) => String(o?.value ?? o) === String(value));
    if (match) return match.label ?? match;
    return String(value);
  })();

  const chipLabel = (
    <Stack direction='row' spacing={0.5} sx={{ alignItems: 'center' }}>
      <Typography
        component='span'
        variant='chipLabel'
        color='text.disabled'
        sx={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
      >
        {def.label}
      </Typography>
      <Typography component='span' variant='chipLabel' color='text.disabled'>
        is
      </Typography>
      <Typography
        component='span'
        variant='chipLabel'
        sx={{ color: 'primary.light', fontWeight: 600 }}
      >
        {displayValue}
      </Typography>
    </Stack>
  );

  return (
    <>
      <Chip
        label={chipLabel}
        onClick={(e) => setAnchor(e.currentTarget)}
        onDelete={onRemove}
        deleteIcon={<CloseIcon fontSize='small' />}
        variant='outlined'
      />

      {def.kind === 'select' ? (
        <Menu anchorEl={anchor} open={open} onClose={() => setAnchor(null)}>
          {(options ?? []).map((opt) => {
            const optVal = opt?.value ?? opt;
            const optLabel = opt?.label ?? opt;
            return (
              <MenuItem
                key={optVal}
                selected={String(value) === String(optVal)}
                onClick={() => {
                  onChange(optVal);
                  setAnchor(null);
                }}
              >
                {optLabel}
              </MenuItem>
            );
          })}
        </Menu>
      ) : (
        <Popover
          anchorEl={anchor}
          open={open}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <Stack spacing={1} sx={{ p: 1.5, width: 240 }}>
            <TextField
              size='small'
              autoFocus
              fullWidth
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder={def.placeholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onChange(textDraft.trim());
                  setAnchor(null);
                }
                if (e.key === 'Escape') {
                  setTextDraft(value || '');
                  setAnchor(null);
                }
              }}
            />
            <Typography variant='tableCell' color='text.disabled'>
              Press Enter to apply
            </Typography>
          </Stack>
        </Popover>
      )}
    </>
  );
}
