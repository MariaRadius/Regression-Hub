import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { listSnapshots } from '@/lib/db/reportSnapshotsData';
import { getDb } from '@/lib/mongodb';
import ReportsClient from './ReportsClient';

export const metadata = {
  title: 'Reports | Regression Hub',
  description:
    'Generate PDF signoff reports and Excel exports for any release and environment.',
};

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);

  const db = await getDb();
  const initialSnapshots = await listSnapshots(db, session.user.teamId);

  return <ReportsClient initialSnapshots={initialSnapshots} />;
}
