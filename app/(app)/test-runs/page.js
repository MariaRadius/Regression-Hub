import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import Panel from '@/components/Panel';
import TestRunRow from '@/components/TestRunRow';
import { authOptions } from '@/lib/auth';
import { listTestRuns } from '@/lib/db/testRunsData';
import { getDb } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Test Runs',
  description: 'History of Excel import test runs for your team.',
};

export default async function TestRunsPage() {
  const [session, db] = await Promise.all([
    getServerSession(authOptions),
    getDb(),
  ]);

  const teamId = session?.user?.teamId;
  if (!teamId) redirect('/');

  const rawRuns = await listTestRuns(db, teamId);

  const runs = rawRuns.map((r) => ({
    _id: String(r._id),
    uploadedFileName: r.uploadedFileName,
    testEnvironment: r.testEnvironment,
    softwareVersion: r.softwareVersion,
    importedCount: r.importedCount,
    totalInFile: r.totalInFile,
    refreshedCount: r.updatedCount ?? r.duplicatesSkipped ?? 0,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  }));

  return (
    <Stack spacing={3}>
      <PageHeader
        eyebrow='History'
        title='Test Runs'
        sub={`Each Excel import creates a new test run. ${runs.length} total.`}
      />

      {runs.length === 0 ? (
        <EmptyState icon={<RefreshOutlined />} title='No test runs yet'>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
            Each Excel file you import will appear here as a test run.
          </Typography>
          <Button variant='contained' component={Link} href='/import-cases'>
            Import Excel File
          </Button>
        </EmptyState>
      ) : (
        <Panel title='Import History'>
          <TableContainer sx={{ maxHeight: 'calc(100vh - 280px)' }}>
            <Table size='small' stickyHeader aria-label='Import history'>
              <TableHead
                sx={{
                  '& th': {
                    bgcolor: 'action.selected',
                    borderBottomWidth: 2,
                    borderBottomColor: 'divider',
                  },
                }}
              >
                <TableRow>
                  <TableCell scope='col'>File Name</TableCell>
                  <TableCell scope='col'>Environment</TableCell>
                  <TableCell scope='col'>Version</TableCell>
                  <TableCell scope='col'>Imported</TableCell>
                  <TableCell scope='col'>Updated</TableCell>
                  <TableCell scope='col'>Imported On</TableCell>
                  <TableCell scope='col'>Report</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {runs.map((run) => (
                  <TestRunRow key={run._id} run={run} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Panel>
      )}
    </Stack>
  );
}
