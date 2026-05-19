'use client';

import { useState, useEffect } from 'react';
import ToastProvider, { showToast } from '@/components/Toast';
import { normalizedStatus, dateStamp } from '@/utils/formatters';

export default function ReportsPage() {
  const [applications, setApplications] = useState([]);
  const [versions, setVersions] = useState([]);
  const [selectedApp, setSelectedApp] = useState('');
  const [selectedVersion, setSelectedVersion] = useState('');
  const [environment, setEnvironment] = useState('');
  const [version, setVersion] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingVersion, setGeneratingVersion] = useState('');
  const [deletingVersion, setDeletingVersion] = useState('');
  const [restoringVersion, setRestoringVersion] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(null); // { version, isCurrent } pending confirmation
  const [confirmComplete, setConfirmComplete] = useState(null); // version string
  const [completingVersion, setCompletingVersion] = useState('');
  const [versionFilter, setVersionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewModal, setViewModal] = useState(null);       // { version, summary, byModule, byTester }
  const [viewLoading, setViewLoading] = useState('');
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    fetch('/api/applications').then((r) => r.json()).then(setApplications);
    fetch('/api/versions').then((r) => r.json()).then((v) => setVersions(Array.isArray(v) ? v : []));
    fetchSummary('');

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

  async function deleteVersion(ver, isCurrent) {
    const msg = isCurrent
      ? `Delete ALL test cases for active version "${ver}"?\n\nThis permanently removes them and cannot be undone.`
      : `Remove the historical snapshot for version "${ver}"?\n\nThis removes the saved history entry but leaves the current test cases untouched.`;
    if (!confirm(msg)) return;
    setDeletingVersion(ver);
    try {
      const params = new URLSearchParams({ version: ver, isCurrent: String(isCurrent) });
      const res = await fetch(`/api/versions?${params}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVersions((prev) => prev.filter((v) => v.version !== ver));
      if (selectedVersion === ver) setSelectedVersion('');
      showToast(
        isCurrent
          ? `Deleted ${data.deleted} test cases for v${ver}`
          : `Removed history snapshot for v${ver} from ${data.deleted} test case(s)`,
        'success'
      );
      fetchSummary(selectedApp);
    } catch (e) {
      showToast(e.message || 'Delete failed', 'error');
    } finally {
      setDeletingVersion('');
    }
  }

  async function viewVersion(ver) {
    setViewLoading(ver);
    try {
      const res = await fetch(`/api/versions/history-detail?version=${encodeURIComponent(ver)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setViewModal(data);
    } catch (e) {
      showToast(e.message || 'Failed to load version detail', 'error');
    } finally {
      setViewLoading('');
    }
  }

  function restoreVersion(ver, isCurrent) {
    setConfirmRestore({ version: ver, isCurrent });
  }

  async function doRestore({ version: ver, isCurrent }) {
    setConfirmRestore(null);
    setRestoringVersion(ver);
    try {
      if (isCurrent) {
        // ACTIVE version: bulk-retag all test cases to this version
        const res = await fetch('/api/test-cases-bulk', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filter: {}, fields: { softwareVersionTested: ver } }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Bulk update failed');
        showToast(`All test cases set to v${ver}`, 'success');
      } else {
        // Historical version: restore from history[] snapshot
        const res = await fetch('/api/versions/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: ver }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast(`Restored ${data.restored} test cases to v${ver}`, 'success');
      }
      fetch('/api/versions').then((r) => r.json()).then((v) => setVersions(Array.isArray(v) ? v : []));
      fetchSummary(selectedApp);
    } catch (e) {
      showToast(e.message || 'Restore failed', 'error');
    } finally {
      setRestoringVersion('');
    }
  }

  async function markComplete(ver) {
    setConfirmComplete(null);
    setCompletingVersion(ver);
    try {
      const res = await fetch('/api/versions/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: ver }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`v${ver} marked as completed — ${data.snapshotted} test cases snapshotted`, 'success');
      fetch('/api/versions').then((r) => r.json()).then((v) => setVersions(Array.isArray(v) ? v : []));
    } catch (e) {
      showToast(e.message || 'Failed to complete version', 'error');
    } finally {
      setCompletingVersion('');
    }
  }

  async function exportExcel(overrideVersion) {
    const isCustomExport = overrideVersion === undefined;
    try {
      const params = new URLSearchParams();
      if (selectedApp) params.set('applicationId', selectedApp);
      const ver = overrideVersion ?? selectedVersion;
      if (ver) params.set('softwareVersion', ver);
      const res = await fetch(`/api/export-data?${params}`);
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

      // Auto-tag test cases with this version so it appears in Version History
      if (isCustomExport && version) {
        fetch('/api/test-cases-bulk', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: { applicationId: selectedApp || undefined },
            fields: { softwareVersionTested: version },
          }),
        }).then(() => fetch('/api/versions').then((r) => r.json()).then((v) => setVersions(Array.isArray(v) ? v : []))).catch(() => {});
      }
    } catch (e) {
      console.error(e);
      showToast('Export failed', 'error');
    }
  }

  async function exportPdf(overrideVersion) {
    const isVersionExport = overrideVersion !== undefined;
    if (isVersionExport) setGeneratingVersion(overrideVersion);
    else setGeneratingPdf(true);
    try {
      const params = new URLSearchParams();
      if (selectedApp) params.set('applicationId', selectedApp);
      const ver = overrideVersion ?? selectedVersion;
      if (ver) params.set('softwareVersion', ver);
      const res = await fetch(`/api/export-data?${params}`);
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

      // Auto-tag test cases with this version so it appears in Version History
      if (!isVersionExport && version) {
        fetch('/api/test-cases-bulk', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: { applicationId: selectedApp || undefined },
            fields: { softwareVersionTested: version },
          }),
        }).then(() => fetch('/api/versions').then((r) => r.json()).then((v) => setVersions(Array.isArray(v) ? v : []))).catch(() => {});
      }
    } catch (e) {
      console.error(e);
      showToast('PDF export failed', 'error');
    } finally {
      setGeneratingPdf(false);
      setGeneratingVersion('');
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

      {/* Version History */}
      {versions.length > 0 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ margin: 0 }}>Version History</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {/* Version search filter */}
              <div style={{ position: 'relative' }}>
                <svg style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  value={versionFilter}
                  onChange={(e) => setVersionFilter(e.target.value)}
                  placeholder="Filter version…"
                  style={{ paddingLeft: 26, paddingRight: 8, height: 30, border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, width: 140, background: 'var(--surface-2)', color: 'var(--ink)', outline: 'none' }}
                />
              </div>
              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ height: 30, border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, padding: '0 8px', background: 'var(--surface-2)', color: 'var(--ink)', cursor: 'pointer' }}
              >
                <option value="">All statuses</option>
                <option value="active">Active only</option>
                <option value="completed">Completed only</option>
              </select>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>click a row to select for export</span>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th style={{ textAlign: 'center' }}>Total</th>
                <th style={{ textAlign: 'center' }}>Pass</th>
                <th style={{ textAlign: 'center' }}>Fail</th>
                <th style={{ textAlign: 'center' }}>Pending</th>
                <th style={{ textAlign: 'center' }}>Pass Rate</th>
                <th style={{ textAlign: 'right' }}>Last Updated</th>
                <th style={{ textAlign: 'center' }}>Export</th>
                <th style={{ width: 72, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {versions
                .filter((v) => {
                  if (versionFilter && !v.version.toLowerCase().includes(versionFilter.toLowerCase())) return false;
                  if (statusFilter === 'active' && !v.isCurrent) return false;
                  if (statusFilter === 'completed' && v.isCurrent) return false;
                  return true;
                })
                .map((v) => {
                const isSelected = selectedVersion === v.version;
                return (
                  <tr
                    key={v.version}
                    onClick={() => setSelectedVersion(isSelected ? '' : v.version)}
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(13,148,136,0.07)' : undefined,
                      outline: isSelected ? '2px solid rgba(13,148,136,0.35)' : undefined,
                    }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isSelected && <span style={{ color: 'var(--accent)', fontSize: 12 }}>●</span>}
                        <span style={{
                          background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.3)',
                          borderRadius: 6, padding: '2px 10px', fontFamily: 'var(--font-mono)',
                          fontSize: 13, fontWeight: 700, color: '#0d9488',
                        }}>v{v.version}</span>
                        {v.isCurrent
                          ? <span style={{ fontSize: 10, background: 'rgba(13,148,136,0.15)', color: '#0d9488', borderRadius: 10, padding: '1px 7px', fontWeight: 600 }}>ACTIVE</span>
                          : <span style={{ fontSize: 10, background: 'var(--surface-2)', color: 'var(--muted)', borderRadius: 10, padding: '1px 7px' }}>completed</span>}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{v.total}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: 'var(--pass)', fontWeight: 600 }}>{v.passed}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: v.failed > 0 ? 'var(--fail)' : 'var(--muted)', fontWeight: v.failed > 0 ? 600 : 400 }}>{v.failed}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: 'var(--pending)', fontWeight: 600 }}>{v.pending}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                        <div style={{ flex: 1, maxWidth: 60, height: 5, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${v.passRate}%`, height: '100%', background: 'var(--pass)', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, minWidth: 32 }}>{v.passRate}%</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>
                      {v.lastUpdated ? new Date(v.lastUpdated).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                        {!v.isCurrent && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => viewVersion(v.version)}
                            disabled={viewLoading === v.version}
                            style={{ fontSize: 11 }}
                          >
                            {viewLoading === v.version ? '…' : '👁 View'}
                          </button>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={() => exportExcel(v.version)} style={{ fontSize: 11 }}>Excel</button>
                        <button className="btn btn-primary btn-sm" onClick={() => exportPdf(v.version)} disabled={generatingVersion === v.version} style={{ fontSize: 11 }}>
                          {generatingVersion === v.version ? '…' : 'PDF'}
                        </button>
                      </div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {/* Mark Complete icon — only for ACTIVE versions */}
                      {v.isCurrent && (
                        <button
                          onClick={() => setConfirmComplete(v.version)}
                          disabled={completingVersion === v.version}
                          title={`Mark v${v.version} as completed`}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: completingVersion === v.version ? 'var(--muted)' : '#16a34a',
                            padding: '3px 5px', borderRadius: 4, lineHeight: 1,
                            opacity: 0.75, transition: 'opacity 150ms, background 150ms',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(22,163,74,0.1)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.75'; e.currentTarget.style.background = 'none'; }}
                        >
                          {completingVersion === v.version ? '…' : (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                              <polyline points="22 4 12 14.01 9 11.01"/>
                            </svg>
                          )}
                        </button>
                      )}
                      {/* Restore icon — shown on ALL rows */}
                      <button
                        onClick={() => restoreVersion(v.version, v.isCurrent)}
                        disabled={restoringVersion === v.version}
                        title={v.isCurrent ? `Set all test cases to v${v.version}` : `Restore test cases to saved state from v${v.version}`}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: restoringVersion === v.version ? 'var(--muted)' : '#0d9488',
                          padding: '3px 5px', borderRadius: 4, lineHeight: 1,
                          opacity: 0.75, transition: 'opacity 150ms, background 150ms',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(13,148,136,0.1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.75'; e.currentTarget.style.background = 'none'; }}
                      >
                        {restoringVersion === v.version ? '…' : (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                            <path d="M3 3v5h5"/>
                            <path d="M12 7v5l3 2"/>
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => deleteVersion(v.version, v.isCurrent)}
                        disabled={deletingVersion === v.version}
                        title={v.isCurrent ? `Delete all test cases for v${v.version}` : `Remove history snapshot for v${v.version}`}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: deletingVersion === v.version ? 'var(--muted)' : '#dc2626',
                          padding: '3px 5px', borderRadius: 4, lineHeight: 1,
                          opacity: 0.7, transition: 'opacity 150ms, background 150ms',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(220,38,38,0.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.background = 'none'; }}
                      >
                        {deletingVersion === v.version ? '…' : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {selectedVersion && (
            <div style={{ padding: '10px 20px', background: 'rgba(13,148,136,0.05)', borderTop: '1px solid rgba(13,148,136,0.15)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>● Selected: v{selectedVersion}</span>
              <span style={{ color: 'var(--muted)' }}>— custom export below will use this version</span>
              <button onClick={() => setSelectedVersion('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}>Clear ×</button>
            </div>
          )}
        </div>
      )}

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header"><h3>Custom Export {selectedVersion && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--accent)' }}>— scoped to v{selectedVersion}</span>}</h3></div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
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
              <label className="field-label">Software Version (for PDF header)</label>
              <input className="field-input" value={version} onChange={(e) => setVersion(e.target.value)} onBlur={() => fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testEnvironment: environment, softwareVersion: version }) }).catch(() => {})} placeholder="e.g. 2.4.1" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => exportExcel()}>Export Excel</button>
            <button className="btn btn-primary" onClick={() => exportPdf()} disabled={generatingPdf}>
              {generatingPdf ? 'Generating…' : 'Export PDF Signoff'}
            </button>
          </div>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {confirmRestore && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1002, padding: 20,
        }} onClick={(e) => e.target === e.currentTarget && setConfirmRestore(null)}>
          <div style={{
            background: '#ffffff', borderRadius: 14, width: '100%', maxWidth: 440,
            padding: '32px 28px', boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
            textAlign: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <div style={{ background: 'rgba(13,148,136,0.1)', border: '2px solid rgba(13,148,136,0.25)', borderRadius: '50%', width: 62, height: 62, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                  <path d="M12 7v5l3 2"/>
                </svg>
              </div>
            </div>

            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>Restore to v{confirmRestore.version}?</h3>

            {confirmRestore.isCurrent ? (
              <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.6, margin: '0 0 24px' }}>
                All test cases across every version will be <strong>retagged to v{confirmRestore.version}</strong>, consolidating everything into a single active version.
              </p>
            ) : (
              <>
                <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.6, margin: '0 0 10px' }}>
                  All current test case results will be <strong>reset to their saved state from v{confirmRestore.version}</strong>.
                </p>
                <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.6, margin: '0 0 24px' }}>
                  Your current state is automatically saved as a history entry — you can always restore back to it.
                </p>
              </>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmRestore(null)} style={{ minWidth: 100 }}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ background: '#0d9488', borderColor: '#0d9488', minWidth: 140 }}
                onClick={() => doRestore(confirmRestore)}
              >
                Yes, Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Complete Confirmation Modal */}
      {confirmComplete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1002, padding: 20,
        }} onClick={(e) => e.target === e.currentTarget && setConfirmComplete(null)}>
          <div style={{ background: '#ffffff', borderRadius: 14, width: '100%', maxWidth: 420, padding: '32px 28px', boxShadow: '0 24px 64px rgba(0,0,0,0.28)', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <div style={{ background: 'rgba(22,163,74,0.1)', border: '2px solid rgba(22,163,74,0.25)', borderRadius: '50%', width: 62, height: 62, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>Mark v{confirmComplete} as Completed?</h3>
            <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.6, margin: '0 0 24px' }}>
              This saves a snapshot of all test case results for v{confirmComplete} and marks the testing cycle as <strong>done</strong>. The version will appear as <strong>completed</strong> in history and can be viewed or restored anytime.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmComplete(null)} style={{ minWidth: 100 }}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ background: '#16a34a', borderColor: '#16a34a', minWidth: 160 }}
                onClick={() => markComplete(confirmComplete)}
              >
                Yes, Mark Complete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version History Detail Modal */}
      {viewModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }} onClick={(e) => e.target === e.currentTarget && setViewModal(null)}>
          <div style={{
            background: '#ffffff', borderRadius: 14, width: '100%', maxWidth: 720,
            maxHeight: '88vh', overflow: 'auto',
            boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
          }}>
            {/* Modal header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.3)',
                  borderRadius: 6, padding: '3px 12px', fontFamily: 'var(--font-mono)',
                  fontSize: 15, fontWeight: 700, color: '#0d9488',
                }}>v{viewModal.version}</span>
                <span style={{ fontSize: 12, background: '#f1f5f9', color: '#64748b', borderRadius: 10, padding: '2px 10px' }}>Historical Snapshot</span>
              </div>
              <button onClick={() => setViewModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--muted)', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: 24 }}>
              {/* Summary row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 24 }}>
                {[
                  { label: 'Total', value: viewModal.summary.total, color: 'var(--ink)' },
                  { label: 'Passed', value: viewModal.summary.passed, color: '#16a34a' },
                  { label: 'Failed', value: viewModal.summary.failed, color: '#dc2626' },
                  { label: 'Pending', value: viewModal.summary.pending, color: '#d97706' },
                  { label: 'Pass Rate', value: `${viewModal.summary.passRate}%`, color: viewModal.summary.passRate >= 80 ? '#16a34a' : '#d97706' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 16px', textAlign: 'center', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Module breakdown */}
              {viewModal.byModule.length > 0 && (
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--ink)' }}>Module Breakdown</div>
                  <table style={{ width: '100%', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)' }}>
                        <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600 }}>Module</th>
                        <th style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600 }}>Total</th>
                        <th style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, color: '#16a34a' }}>Pass</th>
                        <th style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, color: '#dc2626' }}>Fail</th>
                        <th style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, color: '#d97706' }}>Pending</th>
                        <th style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600 }}>Pass Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewModal.byModule.map((m, i) => (
                        <tr key={`${m.module}-${i}`} style={{ borderTop: '1px solid var(--line)' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 500 }}>{m.module}</td>
                          <td style={{ textAlign: 'center', padding: '8px 10px' }}>{m.total}</td>
                          <td style={{ textAlign: 'center', padding: '8px 10px', color: '#16a34a', fontWeight: 600 }}>{m.passed}</td>
                          <td style={{ textAlign: 'center', padding: '8px 10px', color: m.failed > 0 ? '#dc2626' : 'var(--muted)', fontWeight: m.failed > 0 ? 600 : 400 }}>{m.failed}</td>
                          <td style={{ textAlign: 'center', padding: '8px 10px', color: m.pending > 0 ? '#d97706' : 'var(--muted)' }}>{m.pending}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ flex: 1, height: 5, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${m.passRate}%`, height: '100%', background: '#16a34a', borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 30, textAlign: 'right' }}>{m.passRate}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tester breakdown */}
              {viewModal.byTester.length > 0 && (
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--ink)' }}>Tester Breakdown</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {viewModal.byTester.map((t) => (
                      <div key={t.tester} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 16px', minWidth: 140 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{t.tester}</div>
                        <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                          <span style={{ color: '#16a34a', fontWeight: 600 }}>{t.passed}P</span>
                          <span style={{ color: '#dc2626', fontWeight: 600 }}>{t.failed}F</span>
                          <span style={{ color: '#d97706' }}>{t.pending} pending</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {viewModal.summary.total === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)' }}>
                  No snapshot data found for this version. Try re-importing a newer version to generate history.
                </div>
              )}

              {/* Footer actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                <button className="btn btn-secondary" onClick={() => { exportExcel(viewModal.version); }}>Export Excel</button>
                <button className="btn btn-secondary" onClick={() => { exportPdf(viewModal.version); }}>Export PDF</button>
                <button
                  className="btn btn-primary"
                  style={{ background: '#0d9488', borderColor: '#0d9488' }}
                  onClick={() => { setViewModal(null); setConfirmRestore({ version: viewModal.version, isCurrent: false }); }}
                  disabled={restoringVersion === viewModal.version}
                >
                  ↩ Restore to This Version
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
