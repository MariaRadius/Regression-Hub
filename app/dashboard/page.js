'use client';

import { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import UploadExcel from '@/components/UploadExcel';
import ToastProvider from '@/components/Toast';

const COLORS = { Pass: '#16a34a', Fail: '#dc2626', Pending: '#d97706' };

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [latestVersion, setLatestVersion] = useState('');

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, settingsRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/settings'),
      ]);
      const json = await dashRes.json();
      setData(json);
      const settings = await settingsRes.json();
      setLatestVersion(settings.softwareVersion || '');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const summary = data?.summary || { total: 0, passed: 0, failed: 0, pending: 0, passPercent: 0, failPercent: 0 };

  const donutData = [
    { name: 'Pass', value: summary.passed },
    { name: 'Fail', value: summary.failed },
    { name: 'Pending', value: summary.pending },
  ].filter((d) => d.value > 0);

  const moduleBarData = Object.entries(data?.moduleGroups || {})
    .map(([name, g]) => ({ name: name.length > 20 ? name.slice(0, 20) + '…' : name, Pass: g.passed, Fail: g.failed, Pending: g.pending }))
    .slice(0, 20);

  return (
    <div>
      <ToastProvider />
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="page-eyebrow">QA Regression Control Center</div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Live metrics across all imported test runs</p>
        </div>
        {latestVersion && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--surface-2)', border: '1px solid var(--line)',
            borderRadius: 8, padding: '8px 14px', fontSize: 13,
          }}>
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Current Version</span>
            <span style={{
              background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.4)',
              borderRadius: 6, padding: '2px 10px', fontWeight: 700,
              color: '#0d9488', fontFamily: 'var(--font-mono)', fontSize: 13,
            }}>{latestVersion}</span>
          </div>
        )}
      </div>

      {/* Metric cards */}
      <div className="metric-grid">
        {[
          { label: 'Total Test Cases', value: summary.total, sub: 'All imported' },
          { label: 'Passed', value: summary.passed, cls: 'pass', sub: 'Validated' },
          { label: 'Failed', value: summary.failed, cls: 'fail', sub: 'Needs attention' },
          { label: 'Pending', value: summary.pending, cls: 'pending', sub: 'Awaiting result' },
          { label: 'Pass Rate', value: `${summary.passPercent}%`, sub: 'Of total' },
          { label: 'Fail Rate', value: `${summary.failPercent}%`, sub: 'Of total' },
        ].map(({ label, value, cls, sub }) => (
          <div key={label} className={`metric-card ${cls || ''}`}>
            <div className="metric-label">{label}</div>
            <div className="metric-value">{loading ? '—' : value}</div>
            <div className="metric-sub">{sub}</div>
          </div>
        ))}
      </div>

      {/* Charts + Tester summary row */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="panel">
          <div className="panel-header"><h3>Pass / Fail / Pending</h3></div>
          <div className="panel-body" style={{ minHeight: 260 }}>
            {donutData.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={65} outerRadius={95} dataKey="value" paddingAngle={2}>
                    {donutData.map((entry) => <Cell key={entry.name} fill={COLORS[entry.name]} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">No data yet — import an Excel file to begin.</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header"><h3>QA Tester Summary</h3></div>
          {Object.keys(data?.testerGroups || {}).length ? (
            <div>
              {Object.entries(data.testerGroups).sort(([, a], [, b]) => b.total - a.total).map(([name, g]) => (
                <div key={name} className="summary-row">
                  <div className="summary-name" style={{ fontSize: 13 }}>{name || 'Unassigned'}</div>
                  <div className="summary-meta">
                    <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600 }}>{g.passed} Pass</span>
                    <span style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600 }}>{g.failed} Fail</span>
                    <span style={{ background: '#fef3c7', color: '#b45309', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600 }}>{g.pending} Pending</span>
                  </div>
                  <div className="summary-bar-wrap">
                    <div className="progress-bar">
                      <div className="progress-bar-fill" style={{ width: `${g.total ? Math.round((g.passed / g.total) * 100) : 0}%`, background: 'var(--pass)' }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '20px' }}>No data</div>
          )}
        </div>
      </div>

      {/* Results by Module — full width for maximum chart space */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header"><h3>Results by Module</h3></div>
        <div className="panel-body">
          {moduleBarData.length ? (
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={moduleBarData} margin={{ left: 0, bottom: 80, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value, name) => [value, name]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--line)' }}
                />
                <Legend verticalAlign="top" height={32} formatter={(value) => <span style={{ fontSize: 12 }}>{value}</span>} />
                <Bar dataKey="Pass" fill={COLORS.Pass} radius={[3,3,0,0]} />
                <Bar dataKey="Fail" fill={COLORS.Fail} radius={[3,3,0,0]} />
                <Bar dataKey="Pending" fill={COLORS.Pending} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">No module data yet.</div>
          )}
        </div>
      </div>

      {/* Module + App summary row */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        {[
          { title: 'Module Summary', groups: data?.moduleGroups || {} },
          { title: 'Application Summary', groups: data?.appGroups || {} },
        ].map(({ title, groups }) => (
          <div key={title} className="panel">
            <div className="panel-header"><h3>{title}</h3></div>
            {Object.keys(groups).length ? (
              <div>
                {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([name, g]) => (
                  <div key={name} className="summary-row">
                    <div className="summary-name" style={{ fontSize: 13 }}>{name || 'Unassigned'}</div>
                    <div className="summary-meta">
                      <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600 }}>{g.passed} Pass</span>
                      <span style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600 }}>{g.failed} Fail</span>
                      <span style={{ background: '#fef3c7', color: '#b45309', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600 }}>{g.pending} Pending</span>
                    </div>
                    <div className="summary-bar-wrap">
                      <div className="progress-bar">
                        <div className="progress-bar-fill" style={{ width: `${g.total ? Math.round((g.passed / g.total) * 100) : 0}%`, background: 'var(--pass)' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '20px' }}>No data</div>
            )}
          </div>
        ))}
      </div>

      {/* Upload panel */}
      <div className="panel">
        <div className="panel-header"><h3>Import Excel</h3></div>
        <div className="panel-body">
          <UploadExcel onImported={fetchDashboard} />
        </div>
      </div>
    </div>
  );
}
