'use client';

import { useState, useEffect } from 'react';
import ToastProvider, { showToast } from '@/components/Toast';
import { normalizedStatus, dateStamp } from '@/utils/formatters';

export default function ReportsPage() {
  const [applications, setApplications] = useState([]);
  const [selectedApp, setSelectedApp] = useState('');
  const [environment, setEnvironment] = useState('QA');
  const [version, setVersion] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    fetch('/api/applications').then((r) => r.json()).then(setApplications);
    fetchSummary('');
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

      const { default: jsPDF } = await import('jspdf');
      await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const appName = selectedApp ? applications.find((a) => a._id === selectedApp)?.name : 'All Applications';
      const W = doc.internal.pageSize.width;

      const total = cases.length;
      const passed = cases.filter((t) => normalizedStatus(t.status) === 'Pass').length;
      const failed = cases.filter((t) => normalizedStatus(t.status) === 'Fail').length;
      const pending = total - passed - failed;
      const passPercent = total ? Math.round((passed / total) * 100) : 0;

      // Cover
      doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 100, 'F');
      doc.setFillColor(13, 148, 136); doc.rect(0, 0, W, 4, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22); doc.setFont('helvetica', 'bold');
      doc.text('Regression Testing Signoff Report', 36, 46);
      doc.setFontSize(11); doc.setFont('helvetica', 'normal');
      doc.text(`${appName}  ·  ${environment}  ·  Version: ${version || 'Not specified'}`, 36, 66);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 36, 84);

      // Summary table
      doc.setTextColor(23, 32, 42);
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('Summary', 36, 130);
      doc.autoTable({
        startY: 144,
        head: [['Metric', 'Value']],
        body: [
          ['Application', appName],
          ['Environment', environment],
          ['Software Version', version || 'Not specified'],
          ['Total Test Cases', total],
          ['Passed', passed],
          ['Failed', failed],
          ['Pending', pending],
          ['Pass Rate', `${passPercent}%`],
        ],
        styles: { fontSize: 9, cellPadding: 6 },
        headStyles: { fillColor: [13, 148, 136], textColor: 255 },
        columnStyles: { 1: { cellWidth: 150 } },
        theme: 'grid', tableWidth: 280,
      });

      // Tester breakdown
      const testerGroups = {};
      cases.forEach((tc) => {
        const k = tc.testedBy || 'Unassigned';
        if (!testerGroups[k]) testerGroups[k] = { total: 0, pass: 0, fail: 0, pending: 0 };
        testerGroups[k].total++;
        const st = normalizedStatus(tc.status);
        if (st === 'Pass') testerGroups[k].pass++;
        else if (st === 'Fail') testerGroups[k].fail++;
        else testerGroups[k].pending++;
      });

      doc.setFontSize(14); doc.text('Tested By Summary', 540, 130);
      doc.autoTable({
        startY: 144, margin: { left: 540 },
        head: [['Tester', 'Total', 'Pass', 'Fail', 'Pending']],
        body: Object.entries(testerGroups).map(([name, g]) => [name, g.total, g.pass, g.fail, g.pending]),
        styles: { fontSize: 9, cellPadding: 6 },
        headStyles: { fillColor: [29, 110, 166], textColor: 255 },
        theme: 'grid',
      });

      // Detailed results
      doc.addPage();
      doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 32, 'F');
      doc.setFillColor(13, 148, 136); doc.rect(0, 0, W, 3, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(13);
      doc.text('Detailed Test Results', 36, 22);
      doc.setTextColor(23, 32, 42);
      doc.autoTable({
        startY: 44,
        head: [['Application', 'Module', 'ID', 'Test Case', 'Expected', 'Actual', 'Status', 'Defects', 'Tested By', 'Version']],
        body: cases.slice(0, 500).map((t) => [
          t.applicationName, t.moduleName, t.testCaseId, t.testCase,
          t.expectedResult, t.actualResult, normalizedStatus(t.status),
          t.defectsImprovements, t.testedBy, t.softwareVersionTested,
        ]),
        styles: { fontSize: 7, cellPadding: 4, overflow: 'linebreak' },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        columnStyles: { 3: { cellWidth: 90 }, 4: { cellWidth: 90 }, 5: { cellWidth: 75 }, 7: { cellWidth: 90 } },
        didParseCell(data) {
          if (data.section === 'body' && data.column.index === 6) {
            if (data.cell.raw === 'Pass') data.cell.styles.textColor = [22, 163, 74];
            if (data.cell.raw === 'Fail') data.cell.styles.textColor = [220, 38, 38];
            if (data.cell.raw === 'Pending') data.cell.styles.textColor = [217, 119, 6];
          }
        },
        theme: 'striped',
      });

      // Bug report
      const failedCases = cases.filter((t) => normalizedStatus(t.status) === 'Fail');
      doc.addPage();
      doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 32, 'F');
      doc.setFillColor(220, 38, 38); doc.rect(0, 0, W, 3, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(13);
      doc.text('Bug Report', 36, 22);
      doc.setTextColor(23, 32, 42);
      doc.autoTable({
        startY: 44,
        head: [['Application', 'Module', 'Test Case ID', 'Defects / Improvements', 'Actual Result', 'Tested By']],
        body: failedCases.length
          ? failedCases.map((t) => [t.applicationName, t.moduleName, t.testCaseId, t.defectsImprovements || '—', t.actualResult, t.testedBy])
          : [['-', '-', '-', 'No failed test cases recorded.', '-', '-']],
        styles: { fontSize: 8, cellPadding: 5, overflow: 'linebreak' },
        headStyles: { fillColor: [153, 27, 27], textColor: 255 },
        columnStyles: { 3: { cellWidth: 220 } },
        theme: 'grid',
      });

      // Signoff
      let sy = (doc.lastAutoTable?.finalY || 300) + 40;
      if (sy > doc.internal.pageSize.height - 80) { doc.addPage(); sy = 60; }
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('Signoff', 36, sy);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.text('QA Lead: ___________________________________', 36, sy + 32);
      doc.text('Product Owner: ________________________________', 300, sy + 32);
      doc.text('Date: _______________________________', 565, sy + 32);

      const fileName = `regression-signoff-${dateStamp()}.pdf`;
      doc.save(fileName);
      showToast(`PDF exported: ${fileName}`, 'success');
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
              <input className="field-input" value={environment} onChange={(e) => setEnvironment(e.target.value)} placeholder="QA" />
            </div>
            <div className="field-group">
              <label className="field-label">Software Version</label>
              <input className="field-input" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. 2.4.1" />
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
