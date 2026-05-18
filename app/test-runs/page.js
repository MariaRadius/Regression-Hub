'use client';

import { useState, useEffect } from 'react';

export default function TestRunsPage() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/test-runs')
      .then((r) => r.json())
      .then((d) => { setRuns(d); setLoading(false); });
  }, []);

  return (
    <div>
      <div className="page-header">
        <div className="page-eyebrow">History</div>
        <h1 className="page-title">Test Runs</h1>
        <p className="page-sub">Each Excel import creates a new test run. {runs.length} total.</p>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : runs.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 32, marginBottom: 8 }}>⟳</div>
          <strong>No test runs yet</strong>
          <p>Each Excel file you import will appear here as a test run.</p>
        </div>
      ) : (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>File Name</th>
                <th>Environment</th>
                <th>Version</th>
                <th>Imported</th>
                <th>Duplicates Skipped</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run._id}>
                  <td style={{ fontWeight: 500 }}>{run.uploadedFileName}</td>
                  <td>
                    <span style={{ background: 'var(--surface-3)', border: '1px solid var(--line)', borderRadius: 5, padding: '2px 8px', fontSize: 12 }}>
                      {run.testEnvironment || '—'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{run.softwareVersion || '—'}</td>
                  <td style={{ color: 'var(--pass)', fontWeight: 600 }}>{run.importedCount || 0}</td>
                  <td style={{ color: 'var(--muted)' }}>{run.skippedDuplicateCount || 0}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>{new Date(run.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
