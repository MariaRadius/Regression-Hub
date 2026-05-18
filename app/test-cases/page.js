'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import ToastProvider, { showToast } from '@/components/Toast';
import { normalizedStatus, toDateInputValue, dateStamp } from '@/utils/formatters';

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

  // Team QA users (loaded from settings, team-scoped)
  const [qaUsers, setQaUsers] = useState([]);

  // Bulk fill
  const [bStatus, setBStatus] = useState('');
  const [bFromTester, setBFromTester] = useState('');
  const [bTester, setBTester] = useState('');
  const [bDate, setBDate] = useState('');
  const [bVersion, setBVersion] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectPage(pageIds, allSelected) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) { pageIds.forEach((id) => next.delete(id)); }
      else { pageIds.forEach((id) => next.add(id)); }
      return next;
    });
  }

  // Pagination
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);

  // Sticky context
  const sticky = useRef({ testedBy: '', testedOn: '', softwareVersionTested: '' });
  const versionSaveTimer = useRef(null);

  // Load saved version from team settings — stored in a ref so fetchData can read it
  const settingsVersionRef = useRef('');
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        if (s.softwareVersion) {
          setBVersion(s.softwareVersion);
          settingsVersionRef.current = s.softwareVersion;
        }
        if (s.qaUsers?.length) setQaUsers(s.qaUsers);
      })
      .catch(() => {});
  }, []);

  // When cases load and bVersion is set, apply it to all rows
  const casesRef = useRef([]);
  useEffect(() => { casesRef.current = cases; }, [cases]);

  // Apply version to all visible cases (state + DB) and sync to settings
  function handleVersionChange(val) {
    setBVersion(val);
    clearTimeout(versionSaveTimer.current);
    versionSaveTimer.current = setTimeout(async () => {
      // 1. Update team settings
      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ softwareVersion: val }),
      }).catch(() => {});

      // 2. Apply to all visible cases in state immediately
      if (!val || !casesRef.current.length) return;
      setCases((prev) => prev.map((tc) => ({ ...tc, softwareVersionTested: val })));

      // 3. Persist to DB for all visible cases
      fetch('/api/test-cases-bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: casesRef.current.map((t) => t._id),
          fields: { softwareVersionTested: val },
        }),
      }).catch(() => {});
    }, 800);
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams();
      if (fApp) params.set('applicationId', fApp);
      if (fMod) params.set('moduleId', fMod);
      if (fStatus) params.set('status', fStatus);
      if (fTester) params.set('testedBy', fTester);
      if (fVersion) params.set('version', fVersion);

      // Ensure settings are loaded before cases so the version ref is populated
      if (!settingsVersionRef.current) {
        const s = await fetch('/api/settings').then((r) => r.json()).catch(() => ({}));
        if (s.softwareVersion) {
          settingsVersionRef.current = s.softwareVersion;
          setBVersion(s.softwareVersion);
        }
        if (s.qaUsers?.length) setQaUsers(s.qaUsers);
      }

      const [casesRes, appsRes, modsRes] = await Promise.all([
        fetch(`/api/test-cases?${params}`),
        fetch('/api/applications'),
        fetch('/api/modules'),
      ]);
      const loadedCases = await casesRes.json();
      const ver = settingsVersionRef.current;
      // Apply current team version to every row so display is always in sync
      setCases(ver ? loadedCases.map((tc) => ({ ...tc, softwareVersionTested: ver })) : loadedCases);
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

    const hasSelection = selectedIds.size > 0;
    let targets;
    if (hasSelection) {
      targets = cases.filter((tc) => selectedIds.has(tc._id));
      if (pendingOnly) targets = targets.filter((tc) => normalizedStatus(tc.status) === 'Pending');
    } else {
      targets = pendingOnly
        ? cases.filter((tc) => normalizedStatus(tc.status) === 'Pending')
        : [...cases];
      if (bFromTester) targets = targets.filter((tc) => tc.testedBy === bFromTester);
    }

    if (!targets.length) {
      showToast(pendingOnly ? 'No pending rows' : 'No rows to fill', 'info');
      return;
    }

    setBulkLoading(true);
    try {
      const fields = {};
      if (bStatus) fields.status = bStatus === 'Pending' ? '' : bStatus;
      if (bTester) fields.testedBy = bTester;
      if (bDate) fields.testedOn = bDate;
      if (bVersion) fields.softwareVersionTested = bVersion;
      if (bStatus && bStatus !== 'Pending' && !bDate) fields.testedOn = dateStamp();

      const res = await fetch('/api/test-cases-bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: targets.map((t) => t._id), fields }),
      });
      if (!res.ok) throw new Error('Bulk save failed');

      // Persist the applied version to team settings so dashboard & reports stay in sync
      if (bVersion) {
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ softwareVersion: bVersion }),
        }).catch(() => {});
      }

      setCases((prev) => prev.map((tc) =>
        targets.find((t) => t._id === tc._id) ? { ...tc, ...fields } : tc
      ));
      setSelectedIds(new Set());
      showToast(`${targets.length} rows updated`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBulkLoading(false);
    }
  }

  async function clearAll() {
    if (!confirm('Delete ALL test cases, applications, modules, and test runs from the database?')) return;
    await Promise.all([
      fetch('/api/test-cases', { method: 'DELETE' }),
      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testEnvironment: '', softwareVersion: '' }),
      }),
    ]);
    setCases([]);
    setApplications([]);
    setModules([]);
    setBVersion('');
    settingsVersionRef.current = '';
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
      const pw = doc.internal.pageSize.width;
      const ph = doc.internal.pageSize.height;

      // Draw a donut chart using native jsPDF polygon approximation — no canvas needed
      function drawDonut(cx, cy, outerR, innerR, pass, fail, pend) {
        const tot = pass + fail + pend;
        if (!tot) {
          doc.setFillColor(226, 232, 240);
          doc.circle(cx, cy, outerR, 'F');
          doc.setFillColor(255, 255, 255);
          doc.circle(cx, cy, innerR, 'F');
          return;
        }
        const segs = [
          { count: pass, color: [22, 163, 74] },
          { count: fail, color: [220, 38, 38] },
          { count: pend, color: [217, 119, 6] },
        ].filter((s) => s.count > 0);

        let a0 = -Math.PI / 2;
        for (const seg of segs) {
          const sweep = (seg.count / tot) * 2 * Math.PI;
          const a1 = a0 + sweep;
          const steps = Math.max(6, Math.ceil(sweep * 18));
          const sx = cx + outerR * Math.cos(a0);
          const sy = cy + outerR * Math.sin(a0);
          const lines = [];
          let px = sx, py = sy;
          for (let i = 1; i <= steps; i++) {
            const a = a0 + sweep * i / steps;
            const nx = cx + outerR * Math.cos(a); const ny = cy + outerR * Math.sin(a);
            lines.push([nx - px, ny - py]); px = nx; py = ny;
          }
          for (let i = steps; i >= 0; i--) {
            const a = a0 + sweep * i / steps;
            const nx = cx + innerR * Math.cos(a); const ny = cy + innerR * Math.sin(a);
            lines.push([nx - px, ny - py]); px = nx; py = ny;
          }
          doc.setFillColor(...seg.color);
          doc.lines(lines, sx, sy, [1, 1], 'F', true);
          a0 = a1;
        }
        doc.setFillColor(255, 255, 255);
        doc.circle(cx, cy, innerR, 'F');
      }

      // Overall stats
      const total = cases.length;
      const pass  = cases.filter((t) => normalizedStatus(t.status) === 'Pass').length;
      const fail  = cases.filter((t) => normalizedStatus(t.status) === 'Fail').length;
      const pend  = cases.filter((t) => normalizedStatus(t.status) === 'Pending').length;
      const pct   = total ? Math.round((pass / total) * 100) : 0;

      // ── PAGE 1: Cover ──────────────────────────────────────────
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pw, 80, 'F');
      doc.setFillColor(13, 148, 136);
      doc.rect(0, 0, pw, 4, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22); doc.setFont('helvetica', 'bold');
      doc.text('Regression Testing Signoff Report', 36, 38);
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${new Date().toLocaleString()}`, 36, 58);
      doc.text(`Total: ${total}  |  Passed: ${pass}  |  Failed: ${fail}  |  Pending: ${pend}  |  Pass Rate: ${pct}%`, 36, 72);

      // Overall donut centred on cover page
      drawDonut(pw / 2, 190, 86, 46, pass, fail, pend);

      // Legend below donut
      const legendY = 292;
      const legendItems = [
        [22, 163, 74, `Passed  ${pass}`, pass],
        [220, 38, 38, `Failed  ${fail}`, fail],
        [217, 119, 6, `Pending  ${pend}`, pend],
      ].filter(([,,,,c]) => c > 0);
      legendItems.forEach(([r, g, b, label], i) => {
        const lx = pw / 2 - (legendItems.length * 88) / 2 + i * 88;
        doc.setFillColor(r, g, b); doc.rect(lx, legendY, 10, 10, 'F');
        doc.setTextColor(23, 32, 42); doc.setFontSize(9);
        doc.text(label, lx + 14, legendY + 9);
      });

      // ── PER-APPLICATION pages ──────────────────────────────────
      const appNames = [...new Set(cases.map((t) => t.applicationName))].sort();

      for (const appName of appNames) {
        doc.addPage();
        const appCases = cases.filter((t) => t.applicationName === appName);
        const ap  = appCases.filter((t) => normalizedStatus(t.status) === 'Pass').length;
        const af  = appCases.filter((t) => normalizedStatus(t.status) === 'Fail').length;
        const apd = appCases.filter((t) => normalizedStatus(t.status) === 'Pending').length;
        const at  = appCases.length;
        const apct = at ? Math.round((ap / at) * 100) : 0;

        // App header bar
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pw, 36, 'F');
        doc.setFillColor(13, 148, 136);
        doc.rect(0, 0, pw, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(15); doc.setFont('helvetica', 'bold');
        doc.text(appName, 36, 24);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal');
        doc.text(`${at} test cases  ·  ${apct}% pass rate`, pw - 36, 24, { align: 'right' });

        // Donut (left side)
        const dCx = 96, dCy = 104;
        drawDonut(dCx, dCy, 54, 29, ap, af, apd);

        // Stats (right of donut)
        const sx = 166, sy = 58;
        doc.setFontSize(10);
        doc.setTextColor(22, 163, 74);  doc.text(`● Passed   ${ap}`, sx, sy);
        doc.setTextColor(220, 38, 38);  doc.text(`● Failed   ${af}`, sx, sy + 18);
        doc.setTextColor(217, 119, 6);  doc.text(`● Pending  ${apd}`, sx, sy + 36);
        doc.setTextColor(23, 32, 42);
        doc.setFont('helvetica', 'bold');   doc.text(`${apct}% Pass Rate`, sx, sy + 58);
        doc.setFont('helvetica', 'normal'); doc.text(`${at} total cases`, sx, sy + 74);

        // Module summary table
        const modMap = {};
        for (const tc of appCases) {
          if (!modMap[tc.moduleName]) modMap[tc.moduleName] = { p: 0, f: 0, d: 0 };
          const s = normalizedStatus(tc.status);
          modMap[tc.moduleName][s === 'Pass' ? 'p' : s === 'Fail' ? 'f' : 'd']++;
        }
        const modRows = Object.entries(modMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([mod, s]) => {
            const tot = s.p + s.f + s.d;
            return [mod, tot, s.p, s.f, s.d, `${tot ? Math.round((s.p / tot) * 100) : 0}%`];
          });

        autoTable(doc, {
          startY: 172,
          head: [['Module', 'Total', 'Pass', 'Fail', 'Pending', 'Pass Rate']],
          body: modRows,
          styles: { fontSize: 8, cellPadding: 4 },
          headStyles: { fillColor: [30, 41, 59], textColor: 255 },
          columnStyles: {
            1: { halign: 'center', cellWidth: 50 },
            2: { halign: 'center', cellWidth: 50, textColor: [22, 163, 74], fontStyle: 'bold' },
            3: { halign: 'center', cellWidth: 50, textColor: [220, 38, 38], fontStyle: 'bold' },
            4: { halign: 'center', cellWidth: 60, textColor: [217, 119, 6], fontStyle: 'bold' },
            5: { halign: 'center', cellWidth: 70 },
          },
          theme: 'striped',
        });

        // Defects summary — compact, only if failures exist
        const failedCases = appCases.filter((t) => normalizedStatus(t.status) === 'Fail');
        if (failedCases.length) {
          let dy = (doc.lastAutoTable?.finalY || 300) + 20;
          if (dy + 60 > ph - 20) { doc.addPage(); dy = 36; }

          doc.setFillColor(153, 27, 27);
          doc.rect(0, dy, pw, 22, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(10); doc.setFont('helvetica', 'bold');
          doc.text(
            `Defects Summary  —  ${failedCases.length} failure${failedCases.length !== 1 ? 's' : ''}`,
            36, dy + 15,
          );

          autoTable(doc, {
            startY: dy + 26,
            head: [['Module', 'Test Case ID', 'Defect / Issue']],
            body: failedCases.map((t) => [
              t.moduleName || '—',
              t.testCaseId || '—',
              t.defectsImprovements || t.actualResult || '—',
            ]),
            styles: { fontSize: 8, cellPadding: 5, overflow: 'linebreak' },
            headStyles: { fillColor: [153, 27, 27], textColor: 255 },
            columnStyles: { 0: { cellWidth: 150 }, 1: { cellWidth: 90 } },
            theme: 'grid',
          });
        }
      }

      // ── Signoff page ───────────────────────────────────────────
      doc.addPage();
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pw, 32, 'F');
      doc.setFillColor(13, 148, 136);
      doc.rect(0, 0, pw, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('Signoff', 36, 22);
      doc.setTextColor(23, 32, 42);
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text('QA Lead: ___________________________________', 36, 80);
      doc.text('Product Owner: ________________________________', 300, 80);
      doc.text('Date: _______________________________', 580, 80);

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
  const pageIds = pageData.map((t) => t._id);
  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id));
  const allPageSelected = pageIds.length > 0 && selectedOnPage.length === pageIds.length;
  const somePageSelected = selectedOnPage.length > 0 && !allPageSelected;

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3 style={{ margin: 0 }}>Bulk Fill</h3>
            {selectedIds.size > 0 && (
              <span style={{ fontSize: 12, background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '2px 10px', fontWeight: 600 }}>
                {selectedIds.size} selected
                <button
                  onClick={() => setSelectedIds(new Set())}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 13, marginLeft: 6, padding: 0, lineHeight: 1, opacity: 0.8 }}
                  title="Clear selection"
                >×</button>
              </span>
            )}
          </div>
          <button
            onClick={() => { setBStatus(''); setBFromTester(''); setBTester(''); setBDate(''); setBVersion(''); }}
            title="Clear bulk fill fields"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
          >×</button>
        </div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, alignItems: 'end' }}>
            <div className="field-group">
              <label className="field-label">Fill Status</label>
              <select className="field-select" value={bStatus} onChange={(e) => setBStatus(e.target.value)}>
                <option value="">No change</option>
                <option value="Pass">Pass</option>
                <option value="Fail">Fail</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                From Tester
                <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>(filter)</span>
              </label>
              <select className="field-select" value={bFromTester} onChange={(e) => setBFromTester(e.target.value)}
                style={{ borderColor: bFromTester ? 'var(--accent)' : undefined }}>
                <option value="">All visible</option>
                {qaUsers.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">→ Reassign To</label>
              <select className="field-select" value={bTester} onChange={(e) => setBTester(e.target.value)}>
                <option value="">No change</option>
                {qaUsers.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Fill Date</label>
              <input className="field-input" type="date" value={bDate} onChange={(e) => setBDate(e.target.value)} />
            </div>
            <div className="field-group">
              <label className="field-label">Fill Version</label>
              <input className="field-input" type="text" value={bVersion} onChange={(e) => handleVersionChange(e.target.value)} placeholder="e.g. 2.4.1" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => bulkFill(true)} disabled={bulkLoading} style={{ flex: 1 }}>
                Fill Pending
              </button>
              <button className="btn btn-primary" onClick={() => bulkFill(false)} disabled={bulkLoading} style={{ flex: 1 }}>
                {selectedIds.size > 0 ? `Fill Selected (${selectedIds.size})` : 'Fill Visible'}
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
                {qaUsers.map((u) => <option key={u} value={u}>{u}</option>)}
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
                  <th style={{ width: 36, textAlign: 'center', padding: '8px 6px' }}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      ref={(el) => { if (el) el.indeterminate = somePageSelected; }}
                      onChange={() => toggleSelectPage(pageIds, allPageSelected)}
                      title={allPageSelected ? 'Deselect page' : 'Select page'}
                    />
                  </th>
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
                    selected={selectedIds.has(tc._id)}
                    onToggle={() => toggleSelect(tc._id)}
                    qaUsers={qaUsers}
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

function TestCaseRow({ tc, saving, onSave, selected, onToggle, qaUsers }) {
  const [local, setLocal] = useState(tc);
  useEffect(() => { setLocal(tc); }, [tc]);

  function handleChange(field, value) {
    setLocal((prev) => ({ ...prev, [field]: value }));
    onSave(tc._id, field, value);
  }

  const st = normalizedStatus(local.status);

  return (
    <tr style={{ opacity: saving ? 0.7 : 1, transition: 'opacity 200ms', background: selected ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined }}>
      <td style={{ width: 36, textAlign: 'center', padding: '4px 6px' }}>
        <input type="checkbox" checked={selected} onChange={onToggle} />
      </td>
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
          value={local.actualResult || ''}
          onChange={(e) => setLocal((prev) => ({ ...prev, actualResult: e.target.value }))}
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
          value={local.defectsImprovements || ''}
          onChange={(e) => setLocal((prev) => ({ ...prev, defectsImprovements: e.target.value }))}
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
          {qaUsers.map((u) => <option key={u} value={u}>{u}</option>)}
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
          value={local.softwareVersionTested || ''}
          onChange={(e) => setLocal((prev) => ({ ...prev, softwareVersionTested: e.target.value }))}
          onBlur={(e) => { if (e.target.value !== tc.softwareVersionTested) handleChange('softwareVersionTested', e.target.value); }}
        />
      </td>
    </tr>
  );
}
