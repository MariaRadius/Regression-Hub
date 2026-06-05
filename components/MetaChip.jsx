'use client';

import Chip from '@mui/material/Chip';

export default function MetaChip({
  icon,
  label,
  color = 'default',
  variant = 'filled',
  sx = {},
}) {
  return (
    <Chip
      size='small'
      icon={icon}
      label={label}
      color={color}
      variant={variant}
      sx={{
        maxWidth: '100%',
        height: 24,
        borderRadius: 1.5,
        textTransform: 'none',
        fontWeight: 500,
        '& .MuiChip-label': {
          display: 'block',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          px: 1,
          textTransform: 'none',
        },
        '& .MuiChip-icon': {
          color: 'inherit',
        },
        ...sx,
      }}
    />
  );
}
