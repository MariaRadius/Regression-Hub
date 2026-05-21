import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';

export default async function ApplicationsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const db = await getDb();
  const teamId = session.user.teamId;

  const [applications, dash] = await Promise.all([
    db.collection('applications').find({ teamId }).sort({ name: 1 }).toArray(),
    db.collection('testCases').aggregate([
      { $match: { teamId } },
      {
        $group: {
          _id: '$applicationId',
          total: { $sum: 1 },
          passed: { $sum: { $cond: [{ $eq: ['$status', 'Pass'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'Fail'] }, 1, 0] } },
        },
      },
    ]).toArray(),
  ]);

  const appGroups = Object.fromEntries(
    dash.map(({ _id, total, passed, failed }) => [
      _id,
      { total, passed, failed, pending: total - passed - failed },
    ])
  );

  const apps = applications.map((a) => ({ _id: a._id.toString(), name: a.name }));

  return (
    <div>
      <PageHeader eyebrow="Registry" title="Applications" sub={`Auto-created from imported Excel files. ${apps.length} total.`} />

      {apps.length === 0 ? (
        <EmptyState icon="▣" title="No applications yet">
          <p>Applications are created automatically when you import an Excel file.</p>
        </EmptyState>
      ) : (
        <div className="grid-3">
          {apps.map((app) => {
            const g = appGroups[app._id] || { total: 0, passed: 0, failed: 0, pending: 0 };
            const pct = g.total ? Math.round((g.passed / g.total) * 100) : 0;
            return (
              <div key={app._id} className="panel">
                <div className="panel-body">
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10 }}>{app.name}</div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 13, marginBottom: 10 }}>
                    <span>{g.total} total</span>
                    <span style={{ color: 'var(--pass)' }}>{g.passed} pass</span>
                    <span style={{ color: 'var(--fail)' }}>{g.failed} fail</span>
                    <span style={{ color: 'var(--pending)' }}>{g.pending} pending</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${pct}%`, background: 'var(--pass)' }} />
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>{pct}% pass rate</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
