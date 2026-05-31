import Paper from '@mui/material/Paper';
import PanelHeader from '@/components/PanelHeader';

/**
 * Outlined Paper panel with a standardised header.
 * Replaces the repeated `<Paper variant='outlined'><PanelHeader>` pattern.
 *
 * @param {{ title: import('react').ReactNode, headerActions?: import('react').ReactNode, children: import('react').ReactNode }} props
 */
export default function Panel({ title, children, sx, headerActions }) {
  return (
    <Paper variant='outlined' sx={sx}>
      <PanelHeader actions={headerActions}>{title}</PanelHeader>
      {children}
    </Paper>
  );
}
