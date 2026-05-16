'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import ToastProvider, { showToast } from '@/components/Toast';
import { QA_USERS, normalizedStatus, toDateInputValue, dateStamp } from '@/utils/formatters';

function statusClass(status) {
  if (status === 'Pass') return 'pass';
  if (status === 'Fail') return 'fail';
  return 'pending';
}

export default function TestCasesPage() {
  const [cases, setCases] = useState([]);
  const [applications, setApplications] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});

  // Filters
  const [fApp, setFApp] = useState('');
  const [fMod, setFMod] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fTester, setFTester] = useState('');
  const [fVersion, setFVersion] = useState('');

  // Bulk fill
  const [bStatus, setBStatus] = useState('');
  const [bTester, setBTester] = useState('');
  const [bDate, setBDate] = useState('');
  const [bVersion, setBVersion] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  // Pagination
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);

  // Sticky context
  const sticky = useRef({ testedBy: '', testedOn: '', softwareVersionTested: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fApp) params.set('applicationId', fApp);
      if (fMod) params.set('moduleId', fMod);
      if (fStatus) params.set('status', fStatus);
      if (fTester) params.set('testedBy', fTester);
      if (fVersion) params.set('version', fVersion);

      const [casesRes, appsRes, modsRes] = await Promise.all([
        fetch(`/api/test-cases?${params}`),
        fetch('/api/applications'),
        fetch('/api/modules'),
      ]);
      setCases(await casesRes.json());
      setApplications(await appsRes.json());
      setModules(await modsRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [fApp, fMod, fStatus, fTester, fVersion]);

  useEffect(() => { setPage(1); fetchData(); }, [fetchData]);

  async function saveField(id, field, value) {
    setSaving((s) => ({ ...s, [id]: true }));
    try {
      // Update sticky
      if (['testedBy', 'testedOn', 'softwareVersionTested'].includes(field) && value) {
        sticky.current[field] = value;
      }

      // Auto-fill companions on status set
      let extra = {};
      if ((field === 'status') && (value === 'Pass' || value === 'Fail')) {
        const today = dateStamp();
        if (sticky.current.testedBy) extra.testedBy = sticky.current.testedBy;
        if (sticky.current.softwareVersionTested) extra.softwareVersionTested = sticky.current.softwareVersionTested;
        extra.testedOn = sticky.current.testedOn || today;
      }

      await fetch(`/api/test-cases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value, ...extra }),
      });

      setCases((prev) => prev.map((tc) =>
        tc._id === id ? { ...tc, [field]: value, ...extra } : tc
      ));
      showToast('Saved', 'success', 1200);
    } catch (e) {
      showToast('Save failed', 'error');
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  }

  async function bulkFill(pendingOnly) {
    if (!bStatus && !bTester && !bDate && !bVersion) {
      showToast('Set at least one field', 'info');
      return;
    }
    const targets = pendingOnly
      ? cases.filter((tc) => normalizedStatus(tc.status) === 'Pending')
      : [...cases];

    if (!targets.length) {
      showToast(pendingOnly ? 'No pending rows' : 'No visible rows', 'info');
      return;
    }

    setBulkLoading(true);
    try {
      const fields = {};
      if (bStatus) fields.status = bStatus;
      if (bTester) fields.testedBy = bTester;
      if (bDate) fields.testedOn = bDate;
      if (bVersion) fields.softwareVersionTested = bVersion;
      if (bStatus && !bDate) fields.testedOn = dateStamp();

      const res = await fetch('/api/test-cases-bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: targets.map((t) => t._id), fields }),
      });
      if (!res.ok) throw new Error('Bulk save failed');

      setCases((prev) => prev.map((tc) =>
        targets.find((t) => t._id === tc._id) ? { ...tc, ...fields } : tc
      ));
      showToast(`${targets.length} rows updated`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBulkLoading(false);
    }
  }

  async function clearAll() {
    if (!confirm('Delete ALL test cases, applications, modules, and test runs from the database?')) return;
    await fetch('/api/test-cases', { method: 'DELETE' });
    setCases([]);
    setApplications([]);
    setModules([]);
    showToast('All data cleared', 'info');
  }

  async function exportExcel() {
    try {
      const { utils, writeFile } = await import('xlsx');
      const rows = cases.map((tc) => ({
        'Platform/Application': tc.applicationName,
        'Module': tc.moduleName,
        'Type': tc.type,
        'Traceability': tc.traceability,
        'Test Case ID': tc.testCaseId,
        'Test Case': tc.testCase,
        'Preconditions': tc.preconditions,
        'Steps': tc.steps,
        'Expected Result': tc.expectedResult,
        'Actual Result': tc.actualResult,
        'Status': normalizedStatus(tc.status),
        'Defects/Improvements': tc.defectsImprovements,
        'Tested By': tc.testedBy,
        'Tested On': tc.testedOn,
        'Software Version Tested': tc.softwareVersionTested,
      }));
      const ws = utils.json_to_sheet(rows);
      ws['!cols'] = [22,18,12,14,14,24,18,18,24,24,10,24,12,14,18].map((wch) => ({ wch }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Regression Results');
      writeFile(wb, `regression-results-${dateStamp()}.xlsx`);
      showToast('Excel exported', 'success');
    } catch (e) {
      showToast('Excel export failed', 'error');
    }
  }

  async function exportPdf() {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

      const summary = {
        total: cases.length,
        passed: cases.filter((t) => normalizedStatus(t.status) === 'Pass').length,
        failed: cases.filter((t) => normalizedStatus(t.status) === 'Fail').length,
        pending: cases.filter((t) => normalizedStatus(t.status) === 'Pending').length,
      };
      summary.passPercent = summary.total ? Math.round((summary.passed / summary.total) * 100) : 0;

      // Cover header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, doc.internal.pageSize.width, 80, 'F');
      doc.setFillColor(13, 148, 136);
      doc.rect(0, 0, doc.internal.pageSize.width, 4, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('Regression Testing Signoff Report', 36, 36);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${new Date().toLocaleString()}`, 36, 56);
      doc.text(`Total: ${summary.total}  Pass: ${summary.passed}  Fail: ${summary.failed}  Pending: ${summary.pending}  Pass Rate: ${summary.passPercent}%`, 36, 70);

      doc.setTextColor(23, 32, 42);
      autoTable(doc, {
        startY: 100,
        head: [['Application', 'Module', 'ID', 'Test Case', 'Expected', 'Actual', 'Status', 'Tested By', 'Version']],
        body: cases.slice(0, 500).map((t) => [
          t.applicationName, t.moduleName, t.testCaseId, t.testCase,
          t.expectedResult, t.actualResult, normalizedStatus(t.status),
          t.testedBy, t.softwareVersionTested,
        ]),
        styles: { fontSize: 7, cellPadding: 4, overflow: 'linebreak' },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        columnStyles: { 3: { cellWidth: 100 }, 4: { cellWidth: 100 }, 5: { cellWidth: 80 } },
        didParseCell(data) {
          if (data.section === 'body' && data.column.index === 6) {
            const v = data.cell.raw;
            if (v === 'Pass') data.cell.styles.textColor = [22, 163, 74];
            if (v === 'Fail') data.cell.styles.textColor = [220, 38, 38];
            if (v === 'Pending') data.cell.styles.textColor = [217, 119, 6];
          }
        },
        theme: 'striped',
      });

      // Failed cases
      const failed = cases.filter((t) => normalizedStatus(t.status) === 'Fail');
      if (failed.length) {
        doc.addPage();
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, doc.internal.pageSize.width, 32, 'F');
        doc.setFillColor(220, 38, 38);
        doc.rect(0, 0, doc.internal.pageSize.width, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(13);
        doc.text('Bug Report', 36, 22);
        doc.setTextColor(23, 32, 42);
        autoTable(doc, {
          startY: 44,
          head: [['Application', 'Module', 'Test Case ID', 'Defects/Improvements', 'Actual Result', 'Tested By']],
          body: failed.map((t) => [t.applicationName, t.moduleName, t.testCaseId, t.defectsImprovements || '—', t.actualResult, t.testedBy]),
          styles: { fontSize: 8, cellPadding: 5, overflow: 'linebreak' },
          headStyles: { fillColor: [153, 27, 27], textColor: 255 },
          columnStyles: { 3: { cellWidth: 200 } },
          theme: 'grid',
        });
      }

      // Signoff
      const sy = (doc.lastAutoTable?.finalY || 300) + 36;
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Signoff', 36, sy);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('QA Lead: ___________________________________', 36, sy + 30);
      doc.text('Product Owner: ________________________________', 280, sy + 30);
      doc.text('Date: _______________________________', 560, sy + 30);

      const fileName = `regression-signoff-${dateStamp()}.pdf`;
      doc.save(fileName);
      showToast(`PDF exported: ${fileName}`, 'success');
    } catch (e) {
      console.error(e);
      showToast('PDF export failed', 'error');
    }
  }

  const filteredModules = fApp
    ? modules.filter((m) => m.applicationId === fApp)
    : modules;

  const totalPages = Math.max(1, Math.ceil(cases.length / PAGE_SIZE));
  const pageData = cases.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <ToastProvider />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div className="page-eyebrow">Data Grid</div>
          <h1 className="page-title">Test Cases</h1>
          <p className="page-sub">{loading ? 'Loading…' : `${cases.length} rows visible`}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={exportExcel}>Export Excel</button>
          <button className="btn btn-primary btn-sm" onClick={exportPdf}>Export PDF</button>
          <button className="btn btn-danger btn-sm" onClick={clearAll}>Clear All Data</button>
        </div>
      </div>

      {/* Bulk fill */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Bulk Fill</h3>
          <button
            onClick={() => { setBStatus(''); setBTester(''); setBDate(''); setBVersion(''); }}
            title="Clear bulk fill fields"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
          >×</button>
        </div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, alignItems: 'end' }}>
            <div className="field-group">
              <label className="field-label">Fill Status</label>
              <select className="field-select" value={bStatus} onChange={(e) => setBStatus(e.target.value)}>
                <option value="">No change</option>
                <option value="Pass">Pass</option>
                <option value="Fail">Fail</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Fill Tested By</label>
              <select className="field-select" value={bTester} onChange={(e) => setBTester(e.target.value)}>
                <option value="">No change</option>
                {QA_USERS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Fill Date</label>
              <input className="field-input" type="date" value={bDate} onChange={(e) => setBDate(e.target.value)} />
            </div>
            <div className="field-group">
              <label className="field-label">Fill Version</label>
              <input className="field-input" type="text" value={bVersion} onChange={(e) => setBVersion(e.target.value)} placeholder="No change" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => bulkFill(true)} disabled={bulkLoading} style={{ flex: 1 }}>
                Fill Pending
              </button>
              <button className="btn btn-primary" onClick={() => bulkFill(false)} disabled={bulkLoading} style={{ flex: 1 }}>
                Fill Visible
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-body" style={{ padding: '14px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            <div className="field-group">
              <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                Application
                {fApp && <button onClick={() => { setFApp(''); setFMod(''); }} title="Clear" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>}
              </label>
              <select className="field-select" value={fApp} onChange={(e) => { setFApp(e.target.value); setFMod(''); }}>
                <option value="">All</option>
                {applications.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                Module
                {fMod && <button onClick={() => setFMod('')} title="Clear" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>}
              </label>
              <select className="field-select" value={fMod} onChange={(e) => setFMod(e.target.value)}>
                <option value="">All</option>
                {filteredModules.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                Status
                {fStatus && <button onClick={() => setFStatus('')} title="Clear" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>}
              </label>
              <select className="field-select" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                <option value="">All</option>
                <option value="Pass">Pass</option>
                <option value="Fail">Fail</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                Tested By
                {fTester && <button onClick={() => setFTester('')} title="Clear" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>}
              </label>
              <select className="field-select" value={fTester} onChange={(e) => setFTester(e.target.value)}>
                <option value="">All</option>
                {QA_USERS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Version</label>
              <input className="field-input" type="search" value={fVersion} onChange={(e) => setFVersion(e.target.value)} placeholder="Any version" />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="panel">
        <div className="table-wrap">
          {loading ? (
            <div className="empty-state">Loading test cases…</div>
          ) : cases.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: 32, marginBottom: 8 }}>◎</div>
              <strong>No test cases found</strong>
              <p>Import an Excel file from the Dashboard to populate the grid.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  {['Platform','Module','Type','Traceability','Test Case ID','Test Case','Preconditions',
                    'Steps','Expected Result','Actual Result','Status','Defects','Tested By','Tested On','Version'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.map((tc) => (
                  <TestCaseRow
                    key={tc._id}
                    tc={tc}
                    saving={!!saving[tc._id]}
                    onSave={saveField}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!loading && cases.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--muted)' }}>
            <span>
              Rows {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, cases.length)} of {cases.length}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >← Prev</button>
              <span style={{ padding: '0 8px' }}>Page {page} of {totalPages}</span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TestCaseRow({ tc, saving, onSave }) {
  const [local, setLocal] = useState(tc);
  useEffect(() => { setLocal(tc); }, [tc]);

  function handleChange(field, value) {
    setLocal((prev) => ({ ...prev, [field]: value }));
    onSave(tc._id, field, value);
  }

  const st = normalizedStatus(local.status);

  return (
    <tr style={{ opacity: saving ? 0.7 : 1, transition: 'opacity 200ms' }}>
      <td style={{ color: 'var(--ink-2)', minWidth: 110 }}>{tc.applicationName}</td>
      <td style={{ minWidth: 110 }}>{tc.moduleName}</td>
      <td>{tc.type}</td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{tc.traceability}</td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>{tc.testCaseId}</td>
      <td style={{ minWidth: 180, maxWidth: 220, fontSize: 12 }}>{tc.testCase}</td>
      <td style={{ minWidth: 140, fontSize: 12, color: 'var(--muted)' }}>{tc.preconditions}</td>
      <td style={{ minWidth: 140, fontSize: 12, color: 'var(--muted)' }}>{tc.steps}</td>
      <td style={{ minWidth: 180, fontSize: 12 }}>{tc.expectedResult}</td>
      <td>
        <input
          className="table-input"
          style={{ minWidth: 140 }}
          defaultValue={local.actualResult}
          onBlur={(e) => { if (e.target.value !== tc.actualResult) handleChange('actualResult', e.target.value); }}
        />
      </td>
      <td>
        <select
          className={`table-select ${statusClass(st)}`}
          value={local.status || ''}
          onChange={(e) => handleChange('status', e.target.value)}
          style={{ minWidth: 85 }}
        >
          <option value="">Pending</option>
          <option value="Pass">Pass</option>
          <option value="Fail">Fail</option>
        </select>
      </td>
      <td>
        <input
          className="table-input"
          style={{ minWidth: 140 }}
          defaultValue={local.defectsImprovements}
          onBlur={(e) => { if (e.target.value !== tc.defectsImprovements) handleChange('defectsImprovements', e.target.value); }}
        />
      </td>
      <td>
        <select
          className="table-select"
          value={local.testedBy || ''}
          onChange={(e) => handleChange('testedBy', e.target.value)}
          style={{ minWidth: 100 }}
        >
          <option value="">—</option>
          {QA_USERS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </td>
      <td>
        <input
          className="table-date"
          type="date"
          value={toDateInputValue(local.testedOn)}
          onChange={(e) => handleChange('testedOn', e.target.value)}
          style={{ minWidth: 130 }}
        />
      </td>
      <td>
        <input
          className="table-input"
          style={{ minWidth: 100 }}
          defaultValue={local.softwareVersionTested}
          onBlur={(e) => { if (e.target.value !== tc.softwareVersionTested) handleChange('softwareVersionTested', e.target.value); }}
        />
      </td>
    </tr>
  );
}
