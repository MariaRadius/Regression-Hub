'use client';

import { useState, useEffect } from 'react';
import { normalizedStatus } from '@/utils/formatters';

export default function ModulesPage() {
  const [modules, setModules] = useState([]);
  const [testCases, setTestCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetch('/api/modules'), fetch('/api/test-cases')])
      .then(([a, b]) => Promise.all([a.json(), b.json()]))
      .then(([m, t]) => { setModules(m); setTestCases(t); setLoading(false); });
  }, []);

  return (
    <div>
      <div className="page-header">
        <div className="page-eyebrow">Registry</div>
        <h1 className="page-title">Modules</h1>
        <p className="page-sub">Auto-created from the Module column in imported files. {modules.length} total.</p>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : modules.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 32, marginBottom: 8 }}>⊞</div>
          <strong>No modules yet</strong>
          <p>Modules are created automatically from the Module column in your Excel file.</p>
        </div>
      ) : (
        <div className="panel">
          <table>
            <thead>
              <tr>
                <th>Module</th>
                <th>Application</th>
                <th>Total</th>
                <th>Pass</th>
                <th>Fail</th>
                <th>Pending</th>
                <th>Pass Rate</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((mod) => {
                const mCases = testCases.filter((t) => t.moduleId === mod._id);
                const total = mCases.length;
                const pass = mCases.filter((t) => normalizedStatus(t.status) === 'Pass').length;
                const fail = mCases.filter((t) => normalizedStatus(t.status) === 'Fail').length;
                const pending = total - pass - fail;
                const pct = total ? Math.round((pass / total) * 100) : 0;
                return (
                  <tr key={mod._id}>
                    <td style={{ fontWeight: 500 }}>{mod.name}</td>
                    <td style={{ color: 'var(--muted)' }}>{mod.applicationName}</td>
                    <td>{total}</td>
                    <td style={{ color: 'var(--pass)', fontWeight: 500 }}>{pass}</td>
                    <td style={{ color: 'var(--fail)', fontWeight: 500 }}>{fail}</td>
                    <td style={{ color: 'var(--pending)', fontWeight: 500 }}>{pending}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="progress-bar" style={{ flex: 1, maxWidth: 80 }}>
                          <div className="progress-bar-fill" style={{ width: `${pct}%`, background: 'var(--pass)' }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
