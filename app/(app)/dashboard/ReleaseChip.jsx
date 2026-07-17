'use client';

import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import MetaChip from '@/components/MetaChip';

/**
 * Release/version chip for panel headers. Rendered as a client component so the
 * MUI icon's Emotion styling is generated inside one render tree — passing a MUI
 * icon element as a prop from a Server Component desyncs SSR/hydration classes.
 */
export default function ReleaseChip({ name }) {
  if (!name) return null;
  return (
    <MetaChip
      icon={<LabelOutlinedIcon fontSize='small' />}
      label={name}
      color='info'
      variant='outlined'
    />
  );
}
