import Chip from '@mui/material/Chip';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DownloadPdfButton from '@/components/DownloadPdfButton';
import VersionChip from '@/components/VersionChip';

const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * Renders a single row in the Test Runs import history table.
 *
 * @param {object} props
 * @param {{ _id: string, uploadedFileName: string, testEnvironment: string, softwareVersion: string, importedCount: number, totalInFile: number, refreshedCount: number, createdAt: string }} props.run
 */
export default function TestRunRow({ run }) {
  return (
    <TableRow hover>
      <TableCell>
        <Typography variant='tableCell' fontWeight={600}>
          {run.uploadedFileName}
        </Typography>
      </TableCell>

      <TableCell>
        <Chip
          label={run.testEnvironment || '—'}
          size='small'
          variant='outlined'
        />
      </TableCell>

      <TableCell>
        <VersionChip version={run.softwareVersion} />
      </TableCell>

      <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
        <Tooltip title='Imported / Total in file'>
          <span>
            <Typography
              variant='tableCell'
              component='span'
              color='success.main'
              fontWeight={600}
            >
              {run.importedCount || 0}
            </Typography>
            {run.totalInFile ? (
              <Typography
                variant='tableCell'
                component='span'
                color='text.disabled'
                sx={{ fontSize: 11, ml: 0.5 }}
              >
                / {run.totalInFile}
              </Typography>
            ) : null}
          </span>
        </Tooltip>
      </TableCell>

      <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
        <Typography
          variant='tableCell'
          component='span'
          color={run.refreshedCount > 0 ? 'primary.main' : 'text.disabled'}
          fontWeight={run.refreshedCount > 0 ? 600 : 400}
        >
          {run.refreshedCount}
        </Typography>
      </TableCell>

      <TableCell>
        <Typography variant='tableCell' color='text.disabled'>
          {DATE_FORMATTER.format(new Date(run.createdAt))}
        </Typography>
      </TableCell>

      <TableCell>
        <DownloadPdfButton run={run} />
      </TableCell>
    </TableRow>
  );
}
