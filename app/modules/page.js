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

  // Group modules by application, preserving the sorted order from the API
  const grouped = modules.reduce((acc, mod) => {
    const key = mod.applicationName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(mod);
    return acc;
  }, {});

  const appNames = Object.keys(grouped); // already sorted by API (app name then module name)

  return (
    <div>
      <div className="page-header">
        <div className="page-eyebrow">Registry</div>
        <h1 className="page-title">Modules</h1>
        <p className="page-sub">
          {modules.length} modules across {appNames.length} application{appNames.length !== 1 ? 's' : ''}
        </p>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {appNames.map((appName) => {
            const appModules = grouped[appName];
            const appCases = testCases.filter((t) =>
              appModules.some((m) => m._id === t.moduleId)
            );
            const appTotal = appCases.length;
            const appPass = appCases.filter((t) => normalizedStatus(t.status) === 'Pass').length;
            const appFail = appCases.filter((t) => normalizedStatus(t.status) === 'Fail').length;
            const appPending = appTotal - appPass - appFail;

            return (
              <div key={appName} className="panel">
                {/* Application header */}
                <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0 }}>{appName}</h3>
                  <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                    <span style={{ color: 'var(--muted)' }}>{appModules.length} module{appModules.length !== 1 ? 's' : ''}</span>
                    <span style={{ color: 'var(--pass)', fontWeight: 600 }}>{appPass} Pass</span>
                    <span style={{ color: 'var(--fail)', fontWeight: 600 }}>{appFail} Fail</span>
                    <span style={{ color: 'var(--pending)', fontWeight: 600 }}>{appPending} Pending</span>
                  </div>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>Total</th>
                      <th>Pass</th>
                      <th>Fail</th>
                      <th>Pending</th>
                      <th>Pass Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appModules.map((mod) => {
                      const mCases = testCases.filter((t) => t.moduleId === mod._id);
                      const total = mCases.length;
                      const pass = mCases.filter((t) => normalizedStatus(t.status) === 'Pass').length;
                      const fail = mCases.filter((t) => normalizedStatus(t.status) === 'Fail').length;
                      const pending = total - pass - fail;
                      const pct = total ? Math.round((pass / total) * 100) : 0;
                      return (
                        <tr key={mod._id}>
                          <td style={{ fontWeight: 500 }}>{mod.name}</td>
                          <td>{total}</td>
                          <td style={{ color: 'var(--pass)', fontWeight: 500 }}>{pass}</td>
                          <td style={{ color: 'var(--fail)', fontWeight: 500 }}>{fail}</td>
                          <td style={{ color: 'var(--pending)', fontWeight: 500 }}>{pending}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="progress-bar" style={{ flex: 1, maxWidth: 80, display: 'flex', overflow: 'hidden' }}>
                                {pass > 0 && <div style={{ width: `${(pass / total) * 100}%`, height: '100%', background: 'var(--pass)', transition: 'width 300ms' }} />}
                                {fail > 0 && <div style={{ width: `${(fail / total) * 100}%`, height: '100%', background: 'var(--fail)', transition: 'width 300ms' }} />}
                              </div>
                              <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 36 }}>
                                {pct}%{fail > 0 && <span style={{ color: 'var(--fail)', marginLeft: 2 }}> · {Math.round((fail / total) * 100)}%</span>}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
