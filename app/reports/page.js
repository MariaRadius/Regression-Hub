'use client';

import { useState, useEffect } from 'react';
import ToastProvider, { showToast } from '@/components/Toast';
import { normalizedStatus, dateStamp } from '@/utils/formatters';

export default function ReportsPage() {
  const [applications, setApplications] = useState([]);
  const [selectedApp, setSelectedApp] = useState('');
  const [environment, setEnvironment] = useState('');
  const [version, setVersion] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    fetch('/api/applications').then((r) => r.json()).then(setApplications);
    fetchSummary('');

    // Load saved team settings (persists across logout/login)
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        if (s.testEnvironment !== undefined) setEnvironment(s.testEnvironment);
        if (s.softwareVersion !== undefined) setVersion(s.softwareVersion);
      })
      .catch(() => {});
  }, []);

  async function fetchSummary(appId) {
    const params = appId ? `?applicationId=${appId}` : '';
    const res = await fetch(`/api/dashboard${params}`);
    const data = await res.json();
    setSummary(data.summary);
  }

  async function handleAppChange(id) {
    setSelectedApp(id);
    await fetchSummary(id);
  }

  async function exportExcel() {
    try {
      const params = selectedApp ? `?applicationId=${selectedApp}` : '';
      const res = await fetch(`/api/export-data${params}`);
      const cases = await res.json();
      if (!cases.length) { showToast('No test cases to export', 'info'); return; }

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

      // Summary sheet
      const summaryRows = [
        ['Metric', 'Value'],
        ['Application', selectedApp ? applications.find((a) => a._id === selectedApp)?.name : 'All'],
        ['Environment', environment],
        ['Version', version || 'Not specified'],
        ['Total Test Cases', cases.length],
        ['Passed', cases.filter((t) => normalizedStatus(t.status) === 'Pass').length],
        ['Failed', cases.filter((t) => normalizedStatus(t.status) === 'Fail').length],
        ['Pending', cases.filter((t) => normalizedStatus(t.status) === 'Pending').length],
        ['Generated', new Date().toLocaleString()],
      ];

      const wb = utils.book_new();
      const wsSummary = utils.aoa_to_sheet(summaryRows);
      wsSummary['!cols'] = [{ wch: 24 }, { wch: 30 }];
      utils.book_append_sheet(wb, wsSummary, 'Summary');

      const wsData = utils.json_to_sheet(rows);
      wsData['!cols'] = [22,18,12,14,14,24,18,18,24,24,10,24,12,14,18].map((wch) => ({ wch }));
      utils.book_append_sheet(wb, wsData, 'Test Cases');

      writeFile(wb, `regression-report-${dateStamp()}.xlsx`);
      showToast('Excel report exported', 'success');
    } catch (e) {
      console.error(e);
      showToast('Export failed', 'error');
    }
  }

  async function exportPdf() {
    setGeneratingPdf(true);
    try {
      const params = selectedApp ? `?applicationId=${selectedApp}` : '';
      const res = await fetch(`/api/export-data${params}`);
      const cases = await res.json();
      if (!cases.length) { showToast('No test cases to export', 'info'); setGeneratingPdf(false); return; }

      // jsPDF v4 uses a named export; v3 used default — support both
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.jsPDF ?? jsPDFModule.default;
      // jspdf-autotable v5 ships as default export; v3 as named — support both
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default ?? autoTableModule.autoTable;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const W = doc.internal.pageSize.width;   // 595
      const H = doc.internal.pageSize.height;  // 842
      const ML = 36, MR = 36, CW = W - ML - MR;
      const appName = selectedApp ? applications.find((a) => a._id === selectedApp)?.name : 'All Applications';

      const total = cases.length;
      const passed = cases.filter((t) => normalizedStatus(t.status) === 'Pass').length;
      const failed = cases.filter((t) => normalizedStatus(t.status) === 'Fail').length;
      const pending = total - passed - failed;
      const passPercent = total ? Math.round((passed / total) * 100) : 0;
      const failedCases = cases.filter((t) => normalizedStatus(t.status) === 'Fail');

      // Module groups
      const moduleMap = {};
      cases.forEach((tc) => {
        const key = `${tc.moduleId || tc.moduleName}`;
        if (!moduleMap[key]) moduleMap[key] = { module: tc.moduleName || '—', app: tc.applicationName || '—', total: 0, pass: 0, fail: 0, pending: 0 };
        moduleMap[key].total++;
        const st = normalizedStatus(tc.status);
        if (st === 'Pass') moduleMap[key].pass++;
        else if (st === 'Fail') moduleMap[key].fail++;
        else moduleMap[key].pending++;
      });
      const moduleRows = Object.values(moduleMap).sort((a, b) => a.module.localeCompare(b.module));

      // Draw a donut arc segment using filled triangles
      function drawDonutSegment(cx, cy, outerR, innerR, startDeg, endDeg, color) {
        if (Math.abs(endDeg - startDeg) < 0.1) return;
        doc.setFillColor(color[0], color[1], color[2]);
        const steps = Math.max(4, Math.round(Math.abs(endDeg - startDeg) / 2));
        const outer = [], inner = [];
        for (let i = 0; i <= steps; i++) {
          const a = ((startDeg + (endDeg - startDeg) * i / steps) - 90) * Math.PI / 180;
          outer.push([cx + outerR * Math.cos(a), cy + outerR * Math.sin(a)]);
          inner.push([cx + innerR * Math.cos(a), cy + innerR * Math.sin(a)]);
        }
        const pts = [...outer, ...[...inner].reverse()];
        const segs = pts.slice(1).map((pt, i) => [pt[0] - pts[i][0], pt[1] - pts[i][1]]);
        doc.lines(segs, pts[0][0], pts[0][1], [1, 1], 'F', true);
      }

      function para(text, x, y, maxW, opts = {}) {
        const lines = doc.splitTextToSize(text, maxW);
        doc.text(lines, x, y, opts);
        return lines.length;
      }

      // ── PAGE 1: Cover + Narrative ──────────────────────────────────
      // Dark header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, W, 100, 'F');
      doc.setFillColor(13, 148, 136);
      doc.rect(0, 0, W, 4, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20); doc.setFont('helvetica', 'bold');
      doc.text('Regression Testing Signoff Report', ML, 48);
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text(`${appName}  ·  ${environment}  ·  v${version || 'N/A'}`, ML, 66);
      doc.text(`Generated: ${new Date().toLocaleString()}`, ML, 82);

      // WORK FORM table
      const wfTop = 116;
      const colW = CW / 3;
      doc.setLineWidth(0.5);
      doc.setDrawColor(150, 150, 150);

      // Header row — dark with white text
      doc.setFillColor(30, 41, 59);
      doc.rect(ML, wfTop, CW, 16, 'FD');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
      doc.text('WORK FORM', W / 2, wfTop + 11, { align: 'center' });

      // Label row — light gray background
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      const wfLabels = ['Document Title', 'Document Description', 'Version No.'];
      wfLabels.forEach((lbl, i) => {
        doc.setFillColor(243, 244, 246);
        doc.setTextColor(80, 80, 80);
        doc.rect(ML + colW * i, wfTop + 16, colW, 13, 'FD');
        doc.text(lbl, ML + colW * i + colW / 2, wfTop + 24, { align: 'center' });
      });

      // Value row — white background
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      const wfVals = [`SW-RPT-Regression-${version || 'v0'}`, 'Regression Signoff Report', version || 'N/A'];
      wfVals.forEach((val, i) => {
        doc.setFillColor(255, 255, 255);
        doc.setTextColor(0, 0, 0);
        doc.rect(ML + colW * i, wfTop + 29, colW, 18, 'FD');
        doc.text(val, ML + colW * i + colW / 2, wfTop + 41, { align: 'center' });
      });

      let y = wfTop + 67;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text('Test Environment: ', ML, y);
      const envLabelW = doc.getTextWidth('Test Environment: ');
      doc.setFont('helvetica', 'normal');
      doc.text(environment, ML + envLabelW, y);
      y += 16;
      doc.setFont('helvetica', 'bold');
      doc.text('Software Version: ', ML, y);
      const verLabelW = doc.getTextWidth('Software Version: ');
      doc.setFont('helvetica', 'normal');
      doc.text(version || 'Not specified', ML + verLabelW, y);

      y += 26;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      doc.text(`${appName} Test Results`, ML, y);

      y += 14;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      doc.setTextColor(40, 40, 40);
      const overviewText = `The regression testing phase for ${appName} has been successfully conducted to evaluate its basic functionality and stability.`;
      y += para(overviewText, ML, y, CW) * 13 + 10;

      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text('Detailed Test Results', ML, y);
      y += 14;

      const detailSections = [
        {
          title: 'Login and Authentication',
          body: 'The login and authentication processes were subjected to rigorous testing. Both processes passed successfully, ensuring a secure and efficient user experience.',
        },
        {
          title: 'User Interface',
          body: `The application's user interface was evaluated for responsiveness and basic usability. It passed successfully, demonstrating a user-friendly interface.`,
        },
        {
          title: 'Basic Functionality',
          body: failed === 0
            ? `Core functionalities were tested across all ${total} test cases. All passed successfully.`
            : `Core functionalities were tested. ${passed} of ${total} test cases passed (${passPercent}%), with ${failed} case${failed > 1 ? 's' : ''} failing. These issues are documented in the Bug Report section.`,
        },
        {
          title: 'Compatibility',
          body: 'The application was tested for basic compatibility on different devices and screen sizes. All test cases passed at this level.',
        },
        {
          title: 'Stability',
          body: `The application's stability was assessed to ensure it doesn't crash or freeze during basic interactions. It passed successfully, demonstrating overall stability.`,
        },
      ];

      for (const { title, body } of detailSections) {
        if (y > H - 90) { doc.addPage(); y = 50; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
        doc.setTextColor(0, 0, 0);
        doc.text(`${title}: `, ML, y);
        const titleW = doc.getTextWidth(`${title}: `);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(50, 50, 50);
        const firstLineW = CW - titleW;
        const allBodyLines = doc.splitTextToSize(body, firstLineW);
        doc.text(allBodyLines[0], ML + titleW, y);
        for (let i = 1; i < allBodyLines.length; i++) {
          y += 13;
          doc.text(allBodyLines[i], ML, y);
        }
        y += 18;
      }

      if (y > H - 60) { doc.addPage(); y = 50; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text('Test Case Document', ML, y);
      y += 14;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      doc.setTextColor(50, 50, 50);
      doc.text(`•  Regression Test Cases — ${appName} (v${version || 'N/A'})`, ML, y);

      // ── Summary pages: one per application ────────────────────────
      // Group all cases by application name
      const appGroups = {};
      cases.forEach((tc) => {
        const an = tc.applicationName || 'Unknown';
        if (!appGroups[an]) appGroups[an] = [];
        appGroups[an].push(tc);
      });
      const appGroupNames = Object.keys(appGroups).sort();

      for (const aName of appGroupNames) {
        const appCases = appGroups[aName];
        const aPassed  = appCases.filter((t) => normalizedStatus(t.status) === 'Pass').length;
        const aFailed  = appCases.filter((t) => normalizedStatus(t.status) === 'Fail').length;
        const aPending = appCases.length - aPassed - aFailed;
        const aTotal   = appCases.length;
        const aPassPct = aTotal ? Math.round((aPassed / aTotal) * 100) : 0;

        // Per-application module breakdown
        const aModMap = {};
        appCases.forEach((tc) => {
          const key = tc.moduleId || tc.moduleName || '—';
          if (!aModMap[key]) aModMap[key] = { module: tc.moduleName || '—', total: 0, pass: 0, fail: 0, pending: 0 };
          aModMap[key].total++;
          const st = normalizedStatus(tc.status);
          if (st === 'Pass') aModMap[key].pass++;
          else if (st === 'Fail') aModMap[key].fail++;
          else aModMap[key].pending++;
        });
        const aModRows = Object.values(aModMap).sort((a, b) => a.module.localeCompare(b.module));

        // New page for each application
        doc.addPage();

        // Dark header bar
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, W, 32, 'F');
        doc.setFillColor(13, 148, 136);
        doc.rect(0, 0, W, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(13); doc.setFont('helvetica', 'bold');
        doc.text('Summary', ML, 22);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal');
        doc.text(`${aTotal} cases  ·  ${aPassPct}% pass rate`, W - MR, 22, { align: 'right' });

        // Application title
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
        doc.text(`${aName} — Regression Testing`, W / 2, 58, { align: 'center' });

        // Donut chart
        const cx = W / 2, cy = 178, outerR = 85, innerR = 46;
        const dSegs = [
          { label: 'Passed',  value: aPassed,  color: [22, 163, 74] },
          { label: 'Failed',  value: aFailed,  color: [220, 38, 38] },
          { label: 'Pending', value: aPending, color: [217, 119, 6] },
        ].filter((s) => s.value > 0);

        let curAngle = 0;
        for (const seg of dSegs) {
          const sweep = (seg.value / aTotal) * 360;
          drawDonutSegment(cx, cy, outerR, innerR, curAngle, curAngle + sweep, seg.color);
          curAngle += sweep;
        }

        // Legend
        const legendY = cy + outerR + 14;
        const legendItemW = 88;
        let lx = cx - (dSegs.length * legendItemW) / 2;
        for (const seg of dSegs) {
          doc.setFillColor(seg.color[0], seg.color[1], seg.color[2]);
          doc.rect(lx, legendY, 9, 9, 'F');
          doc.setTextColor(0, 0, 0);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
          doc.text(seg.label, lx + 13, legendY + 7.5);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
          doc.text(`${seg.value}`, lx + 13 + doc.getTextWidth(seg.label) + 4, legendY + 7.5);
          lx += legendItemW;
        }

        // Stats
        const statsY = legendY + 22;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        doc.setTextColor(40, 40, 40);
        doc.text(`Total Test Cases: ${aTotal}`, cx, statsY, { align: 'center' });
        doc.text(`Total Passed: ${aPassed}`, cx, statsY + 14, { align: 'center' });
        doc.text(`Total Failed: ${aFailed}`, cx, statsY + 28, { align: 'center' });
        if (aPending > 0) doc.text(`Total Pending: ${aPending}`, cx, statsY + 42, { align: 'center' });

        // Module summary table
        const modTableY = statsY + (aPending > 0 ? 58 : 44);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text('Module Summary', ML, modTableY);

        autoTable(doc, {
          startY: modTableY + 8,
          head: [['Module', 'Total', 'Pass', 'Fail', 'Pending', 'Pass Rate']],
          body: aModRows.map((m) => {
            const pct = m.total ? Math.round((m.pass / m.total) * 100) : 0;
            return [m.module, m.total, m.pass, m.fail, m.pending, `${pct}%`];
          }),
          margin: { left: ML, right: MR },
          styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak', halign: 'center' },
          headStyles: { fillColor: [30, 41, 59], textColor: 255, halign: 'center' },
          columnStyles: {
            0: { halign: 'left' },
            1: { cellWidth: 50 },
            2: { cellWidth: 50 },
            3: { cellWidth: 50 },
            4: { cellWidth: 60 },
            5: { cellWidth: 60 },
          },
          didParseCell(data) {
            if (data.section === 'body') {
              if (data.column.index === 2) data.cell.styles.textColor = [22, 163, 74];
              if (data.column.index === 3) data.cell.styles.textColor = [220, 38, 38];
              if (data.column.index === 4) data.cell.styles.textColor = [217, 119, 6];
            }
          },
          theme: 'striped',
        });
      }

      // ── PAGE 3: Bug Report ─────────────────────────────────────────
      doc.addPage();
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, W, 32, 'F');
      doc.setFillColor(220, 38, 38);
      doc.rect(0, 0, W, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13); doc.setFont('helvetica', 'bold');
      doc.text('Bug Report', ML, 22);

      doc.setTextColor(40, 40, 40);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      let by = 50;
      const bugSummary = failed === 0
        ? `All ${total} test cases passed during the testing phase. No failures were recorded.`
        : `Out of the ${total} smoke test cases, ${failed} test case${failed > 1 ? 's have' : ' has'} failed during the testing phase. ${failed > 1 ? 'These issues have' : 'This issue has'} been documented and will be addressed in the next release. ${failed > 1 ? 'They include' : 'It includes'} basic functionality-related concerns. Resolving ${failed > 1 ? 'these issues is' : 'this issue is'} essential to ensure a more robust and stable application.`;
      by += para(bugSummary, ML, by, CW) * 13 + 14;

      if (failedCases.length > 0) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text('Failed Test Cases & Defect Details', ML, by);
        by += 8;

        autoTable(doc, {
          startY: by,
          head: [['#', 'Application', 'Module', 'Test Case ID', 'Test Case', 'Defects / Improvements', 'Tested By']],
          body: failedCases.map((t, i) => [
            i + 1,
            t.applicationName || '—',
            t.moduleName || '—',
            t.testCaseId || '—',
            t.testCase || '—',
            t.defectsImprovements || '—',
            t.testedBy || '—',
          ]),
          margin: { left: ML, right: MR },
          styles: { fontSize: 8, cellPadding: 5, overflow: 'linebreak' },
          headStyles: { fillColor: [153, 27, 27], textColor: 255, halign: 'center' },
          columnStyles: {
            0: { cellWidth: 22, halign: 'center' },
            1: { cellWidth: 72 }, 2: { cellWidth: 82 }, 3: { cellWidth: 62, halign: 'center' },
            4: { cellWidth: 103 }, 5: { cellWidth: 130 }, 6: { cellWidth: 52 },
          },
          theme: 'grid',
        });
      }

      doc.save(`regression-signoff-${dateStamp()}.pdf`);
      showToast('PDF exported', 'success');
    } catch (e) {
      console.error(e);
      showToast('PDF export failed', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <div>
      <ToastProvider />
      <div className="page-header">
        <div className="page-eyebrow">Exports</div>
        <h1 className="page-title">Reports</h1>
        <p className="page-sub">Generate PDF signoff reports and Excel exports</p>
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header"><h3>Report Options</h3></div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
            <div className="field-group">
              <label className="field-label">Application / Scope</label>
              <select className="field-select" value={selectedApp} onChange={(e) => handleAppChange(e.target.value)}>
                <option value="">All Applications</option>
                {applications.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Test Environment</label>
              <input className="field-input" value={environment} onChange={(e) => setEnvironment(e.target.value)} onBlur={() => fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testEnvironment: environment, softwareVersion: version }) }).catch(() => {})} placeholder="e.g. QA, Staging" />
            </div>
            <div className="field-group">
              <label className="field-label">Software Version</label>
              <input className="field-input" value={version} onChange={(e) => setVersion(e.target.value)} onBlur={() => fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testEnvironment: environment, softwareVersion: version }) }).catch(() => {})} placeholder="e.g. 2.4.1" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={exportExcel}>Export Excel</button>
            <button className="btn btn-primary" onClick={exportPdf} disabled={generatingPdf}>
              {generatingPdf ? 'Generating…' : 'Export PDF Signoff'}
            </button>
          </div>
        </div>
      </div>

      {summary && (
        <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          {[
            { label: 'Total', value: summary.total },
            { label: 'Passed', value: summary.passed, cls: 'pass' },
            { label: 'Failed', value: summary.failed, cls: 'fail' },
            { label: 'Pending', value: summary.pending, cls: 'pending' },
            { label: 'Pass Rate', value: `${summary.passPercent}%` },
            { label: 'Fail Rate', value: `${summary.failPercent}%` },
          ].map(({ label, value, cls }) => (
            <div key={label} className={`metric-card ${cls || ''}`}>
              <div className="metric-label">{label}</div>
              <div className="metric-value">{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
