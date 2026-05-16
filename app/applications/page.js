'use client';

import { useState, useEffect } from 'react';

export default function ApplicationsPage() {
  const [apps, setApps] = useState([]);
  const [testCases, setTestCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetch('/api/applications'), fetch('/api/test-cases')])
      .then(([a, b]) => Promise.all([a.json(), b.json()]))
      .then(([a, b]) => { setApps(a); setTestCases(b); setLoading(false); });
  }, []);

  function countFor(id) { return testCases.filter((t) => t.applicationId === id).length; }
  function passFor(id) { return testCases.filter((t) => t.applicationId === id && t.status === 'Pass').length; }
  function failFor(id) { return testCases.filter((t) => t.applicationId === id && t.status === 'Fail').length; }

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
            const total = countFor(app._id);
            const pass = passFor(app._id);
            const fail = failFor(app._id);
            const pct = total ? Math.round((pass / total) * 100) : 0;
            return (
              <div key={app._id} className="panel">
                <div className="panel-body">
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10 }}>{app.name}</div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 13, marginBottom: 10 }}>
                    <span>{total} total</span>
                    <span style={{ color: 'var(--pass)' }}>{pass} pass</span>
                    <span style={{ color: 'var(--fail)' }}>{fail} fail</span>
                    <span style={{ color: 'var(--pending)' }}>{total - pass - fail} pending</span>
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
