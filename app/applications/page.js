'use client';

import { useState, useEffect } from 'react';

export default function ApplicationsPage() {
  const [apps, setApps] = useState([]);
  const [appGroups, setAppGroups] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/applications').then((r) => r.json()),
      fetch('/api/dashboard').then((r) => r.json()),
    ]).then(([appsData, dash]) => {
      setApps(Array.isArray(appsData) ? appsData : []);
      setAppGroups(dash.appGroups || {});
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div className="page-eyebrow">Registry</div>
        <h1 className="page-title">Applications</h1>
        <p className="page-sub">Auto-created from imported Excel files. {apps.length} total.</p>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : apps.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 32, marginBottom: 8 }}>▣</div>
          <strong>No applications yet</strong>
          <p>Applications are created automatically when you import an Excel file.</p>
        </div>
      ) : (
        <div className="grid-3">
          {apps.map((app) => {
            const g = appGroups[app.name] || { total: 0, passed: 0, failed: 0, pending: 0 };
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
