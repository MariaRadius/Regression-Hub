'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ToastProvider, { showToast } from '@/components/Toast';
import { normalizedStatus, toDateInputValue, dateStamp } from '@/utils/formatters';
import RichTextEditor, { RichTextDisplay } from '@/components/RichTextEditor';

function statusClass(status) {
  if (status === 'Pass') return 'pass';
  if (status === 'Fail') return 'fail';
  return 'pending';
}

function priorityBadgeStyle(priority) {
  if (priority === 'High')   return { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontWeight: 600 };
  if (priority === 'Medium') return { background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', fontWeight: 600 };
  if (priority === 'Low')    return { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontWeight: 600 };
  return {};
}

const EMPTY_FORM = {
  applicationId: '', moduleId: '', testCaseId: '', testCase: '', type: '',
  traceability: '', preconditions: '', steps: '', expectedResult: '',
  actualResult: '', status: '', defectsImprovements: '', testedBy: '',
  testedOn: '', softwareVersionTested: '', priority: '', jiraStory: '',
};

const PAGE_SIZE = 50;

export default function TestCasesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const [cases, setCases] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [applications, setApplications] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addSaving, setAddSaving] = useState(false);
  const [newModuleName, setNewModuleName] = useState(null);
  const [creatingModule, setCreatingModule] = useState(false);

  // Edit modal
  const [editTc, setEditTc] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  // Filters
  const [fApp, setFApp] = useState('');
  const [fMod, setFMod] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fTester, setFTester] = useState('');
  const [fVersion, setFVersion] = useState('');
  const [fAssignedTo, setFAssignedTo] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fJiraStory, setFJiraStory] = useState('');

  // Assignment modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ assignedTo: '', priority: 'Medium', dueDate: '', notes: '', title: '' });
  const [assignSaving, setAssignSaving] = useState(false);

  const [qaUsers, setQaUsers] = useState([]);

  // Bulk fill
  const [bStatus, setBStatus] = useState('');
  const [bFromTester, setBFromTester] = useState('');
  const [bTester, setBTester] = useState('');
  const [bDate, setBDate] = useState('');
  const [bVersion, setBVersion] = useState('');
  const [bPriority, setBPriority] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  // Bulk edit
  const [bePriority, setBePriority] = useState('');
  const [beJiraStory, setBeJiraStory] = useState('');
  const [beApplication, setBeApplication] = useState('');
  const [beModule, setBeModule] = useState('');
  const [bulkEditLoading, setBulkEditLoading] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Pagination
  const [page, setPage] = useState(1);

  const versionSaveTimer = useRef(null);
  const settingsVersionRef = useRef('');
  const appsModsLoaded = useRef(false);

  const searchParams = useSearchParams();
  useEffect(() => {
    const assignedTo = searchParams.get('assignedTo');
    if (assignedTo) setFAssignedTo(assignedTo);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load settings — apps/modules come from the test-cases response
  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((settings) => {
      if (settings.softwareVersion) {
        const ver = settings.softwareVersion;
        setBVersion(ver);
        settingsVersionRef.current = ver;
        // Apply version to any cases already loaded before this fetch returned
        setCases((prev) =>
          prev.length ? prev.map((tc) => ({ ...tc, softwareVersionTested: ver })) : prev
        );
      }
      if (settings.qaUsers?.length) setQaUsers(settings.qaUsers);
    }).catch(() => {});
  }, []);

  const fetchPage = useCallback(async (pageNum) => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams();
      if (fApp)        params.set('applicationId', fApp);
      if (fMod)        params.set('moduleId', fMod);
      if (fStatus)     params.set('status', fStatus);
      if (fTester)     params.set('testedBy', fTester);
      if (fVersion)    params.set('version', fVersion);
      if (fAssignedTo) params.set('assignedTo', fAssignedTo);
      if (fPriority)   params.set('priority', fPriority);
      if (fJiraStory)  params.set('jiraStory', fJiraStory);
      params.set('page', pageNum);
      params.set('limit', PAGE_SIZE);

      const res  = await fetch(`/api/test-cases?${params}`);
      const json = await res.json();
      const { data = [], total = 0, applications: appsData, modules: modsData } = json;

      // Hydrate filter dropdowns from first response (avoids separate API calls)
      if (!appsModsLoaded.current && appsData) {
        setApplications(appsData);
        setModules(modsData || []);
        appsModsLoaded.current = true;
      }

      const ver = settingsVersionRef.current;
      setCases(ver ? data.map((tc) => ({ ...tc, softwareVersionTested: ver })) : data);
      setTotalCount(total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [fApp, fMod, fStatus, fTester, fVersion, fAssignedTo, fPriority, fJiraStory]);

  useEffect(() => {
    setPage(1);
    fetchPage(1);
  }, [fetchPage]);

  function goToPage(newPage) {
    setPage(newPage);
    fetchPage(newPage);
  }

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

  function handleVersionChange(val) {
    setBVersion(val);
    clearTimeout(versionSaveTimer.current);
    versionSaveTimer.current = setTimeout(async () => {
      settingsVersionRef.current = val;

      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ softwareVersion: val }),
      }).catch(() => {});

      if (!val) return;
      setCases((prev) => prev.map((tc) => ({ ...tc, softwareVersionTested: val })));

      fetch('/api/test-cases-bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: {}, fields: { softwareVersionTested: val } }),
      }).catch(() => {});
    }, 800);
  }

  async function saveField(id, field, value) {
    setSaving((s) => ({ ...s, [id]: true }));
    try {
      let extra = {};
      if (field === 'status' && (value === 'Pass' || value === 'Fail')) {
        const today = dateStamp();
        if (bVersion) extra.softwareVersionTested = bVersion;
        extra.testedOn = today;
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

  // --- Edit Modal ---
  function openEdit(tc) {
    setEditTc(tc);
    setEditForm({
      applicationId: tc.applicationId || '',
      moduleId: tc.moduleId || '',
      testCaseId: tc.testCaseId || '',
      type: tc.type || '',
      traceability: tc.traceability || '',
      priority: tc.priority || '',
      jiraStory: tc.jiraStory || '',
      testCase: tc.testCase || '',
      preconditions: tc.preconditions || '',
      steps: tc.steps || '',
      expectedResult: tc.expectedResult || '',
      actualResult: tc.actualResult || '',
      status: tc.status || '',
      defectsImprovements: tc.defectsImprovements || '',
      testedBy: tc.testedBy || '',
      testedOn: tc.testedOn || '',
      softwareVersionTested: tc.softwareVersionTested || '',
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    setEditSaving(true);
    try {
      const res = await fetch(`/api/test-cases/${editTc._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('Test case updated', 'success');
      const appName = applications.find((a) => a._id === editForm.applicationId)?.name || editTc.applicationName;
      const modName = modules.find((m) => m._id === editForm.moduleId)?.name || editTc.moduleName;
      setCases((prev) => prev.map((tc) =>
        tc._id === editTc._id ? { ...tc, ...editForm, applicationName: appName, moduleName: modName } : tc
      ));
      setEditTc(null);
    } catch (err) {
      showToast(err.message || 'Failed to update', 'error');
    } finally {
      setEditSaving(false);
    }
  }

  // --- Bulk Fill ---
  async function bulkFill(pendingOnly) {
    if (!bStatus && !bTester && !bDate && !bVersion && !bPriority) {
      showToast('Set at least one field', 'info');
      return;
    }

    const fields = {};
    if (bStatus)   fields.status                = bStatus === 'Pending' ? '' : bStatus;
    if (bTester)   fields.testedBy              = bTester;
    if (bDate)     fields.testedOn              = bDate;
    if (bVersion)  fields.softwareVersionTested = bVersion;
    if (bPriority) fields.priority              = bPriority;
    if (bStatus && bStatus !== 'Pending' && !bDate) fields.testedOn = dateStamp();

    setBulkLoading(true);
    try {
      let body;
      if (selectedIds.size > 0) {
        body = { ids: Array.from(selectedIds), fields, pendingOnly };
      } else {
        body = {
          filter: {
            applicationId: fApp || undefined,
            moduleId: fMod || undefined,
            testedBy: bFromTester || undefined,
            version: fVersion || undefined,
          },
          fields,
          pendingOnly,
        };
      }

      const res = await fetch('/api/test-cases-bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Bulk save failed');
      const { updated } = await res.json();

      if (bVersion) {
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ softwareVersion: bVersion }),
        }).catch(() => {});
        settingsVersionRef.current = bVersion;
      }

      fetchPage(page);
      setSelectedIds(new Set());
      showToast(`${updated} rows updated`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBulkLoading(false);
    }
  }

  // --- Bulk Edit ---
  async function bulkEdit() {
    if (!bePriority && !beJiraStory && !beApplication && !beModule) {
      showToast('Set at least one field to change', 'info');
      return;
    }
    if (selectedIds.size === 0) {
      showToast('Select rows first', 'info');
      return;
    }

    const fields = {};
    if (bePriority)   fields.priority      = bePriority;
    if (beJiraStory)  fields.jiraStory     = beJiraStory;
    if (beApplication) fields.applicationId = beApplication;
    if (beModule)     fields.moduleId      = beModule;

    setBulkEditLoading(true);
    try {
      const res = await fetch('/api/test-cases-bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), fields }),
      });
      if (!res.ok) throw new Error('Bulk edit failed');
      const { updated } = await res.json();
      fetchPage(page);
      setSelectedIds(new Set());
      showToast(`${updated} rows updated`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBulkEditLoading(false);
    }
  }

  // --- Add Test Case ---
  async function addTestCase(e) {
    e.preventDefault();
    if (!addForm.applicationId || !addForm.moduleId) {
      showToast('Select an application and module', 'info'); return;
    }
    setAddSaving(true);
    try {
      const app = applications.find((a) => a._id === addForm.applicationId);
      const mod = modules.find((m) => m._id === addForm.moduleId);
      const res = await fetch('/api/test-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...addForm,
          applicationName: app?.name,
          moduleName: mod?.name,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('Test case added', 'success');
      setShowAddModal(false);
      setAddForm(EMPTY_FORM);
      setNewModuleName(null);
      setTotalCount((n) => n + 1);
      fetchPage(page);
    } catch (err) {
      showToast(err.message || 'Failed to add', 'error');
    } finally {
      setAddSaving(false);
    }
  }

  async function createModule() {
    if (!newModuleName.trim()) return;
    if (!addForm.applicationId) { showToast('Select an application first', 'info'); return; }
    setCreatingModule(true);
    try {
      const res = await fetch('/api/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newModuleName.trim(), applicationId: addForm.applicationId }),
      });
      const mod = await res.json();
      if (!res.ok) throw new Error(mod.error);
      setModules((prev) => [...prev, mod]);
      setAddForm((f) => ({ ...f, moduleId: mod._id }));
      setNewModuleName(null);
      showToast(`Module "${mod.name}" created`, 'success');
    } catch (e) {
      showToast(e.message || 'Failed to create module', 'error');
    } finally {
      setCreatingModule(false);
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
    setTotalCount(0);
    setApplications([]);
    setModules([]);
    setBVersion('');
    settingsVersionRef.current = '';
    appsModsLoaded.current = false;
    showToast('All data cleared', 'info');
  }

  async function exportExcel() {
    try {
      const params = new URLSearchParams();
      if (fApp)        params.set('applicationId', fApp);
      if (fMod)        params.set('moduleId', fMod);
      if (fStatus)     params.set('status', fStatus);
      if (fTester)     params.set('testedBy', fTester);
      if (fVersion)    params.set('version', fVersion);
      if (fPriority)   params.set('priority', fPriority);
      if (fJiraStory)  params.set('jiraStory', fJiraStory);
      params.set('limit', '10000');
      const res = await fetch(`/api/test-cases?${params}`);
      const { data: allCases } = await res.json();

      const { utils, writeFile } = await import('xlsx');
      const rows = allCases.map((tc) => ({
        'Platform/Application': tc.applicationName,
        'Module': tc.moduleName,
        'Priority': tc.priority || '',
        'Type': tc.type,
        'Jira Story': tc.jiraStory || '',
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
      ws['!cols'] = [22,18,10,12,14,14,14,24,18,18,24,24,10,24,12,14,18].map((wch) => ({ wch }));
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
      const params = new URLSearchParams();
      if (fApp)    params.set('applicationId', fApp);
      if (fMod)    params.set('moduleId', fMod);
      if (fStatus) params.set('status', fStatus);
      if (fTester) params.set('testedBy', fTester);
      if (fVersion) params.set('version', fVersion);
      if (fPriority) params.set('priority', fPriority);
      if (fJiraStory) params.set('jiraStory', fJiraStory);
      params.set('limit', '10000');
      const res = await fetch(`/api/test-cases?${params}`);
      const { data: allCases } = await res.json();

      const { default: jsPDF } = await import('jspdf');
      const { autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pw = doc.internal.pageSize.width;
      const ph = doc.internal.pageSize.height;

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

      const total = allCases.length;
      const pass  = allCases.filter((t) => normalizedStatus(t.status) === 'Pass').length;
      const fail  = allCases.filter((t) => normalizedStatus(t.status) === 'Fail').length;
      const pend  = allCases.filter((t) => normalizedStatus(t.status) === 'Pending').length;
      const pct   = total ? Math.round((pass / total) * 100) : 0;

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

      drawDonut(pw / 2, 190, 86, 46, pass, fail, pend);

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

      const appNames = [...new Set(allCases.map((t) => t.applicationName))].sort();

      for (const appName of appNames) {
        doc.addPage();
        const appCases = allCases.filter((t) => t.applicationName === appName);
        const ap  = appCases.filter((t) => normalizedStatus(t.status) === 'Pass').length;
        const af  = appCases.filter((t) => normalizedStatus(t.status) === 'Fail').length;
        const apd = appCases.filter((t) => normalizedStatus(t.status) === 'Pending').length;
        const at  = appCases.length;
        const apct = at ? Math.round((ap / at) * 100) : 0;

        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pw, 36, 'F');
        doc.setFillColor(13, 148, 136);
        doc.rect(0, 0, pw, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(15); doc.setFont('helvetica', 'bold');
        doc.text(appName, 36, 24);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal');
        doc.text(`${at} test cases  ·  ${apct}% pass rate`, pw - 36, 24, { align: 'right' });

        const dCx = 96, dCy = 104;
        drawDonut(dCx, dCy, 54, 29, ap, af, apd);

        const sx = 166, sy = 58;
        doc.setFontSize(10);
        doc.setTextColor(22, 163, 74);  doc.text(`● Passed   ${ap}`, sx, sy);
        doc.setTextColor(220, 38, 38);  doc.text(`● Failed   ${af}`, sx, sy + 18);
        doc.setTextColor(217, 119, 6);  doc.text(`● Pending  ${apd}`, sx, sy + 36);
        doc.setTextColor(23, 32, 42);
        doc.setFont('helvetica', 'bold');   doc.text(`${apct}% Pass Rate`, sx, sy + 58);
        doc.setFont('helvetica', 'normal'); doc.text(`${at} total cases`, sx, sy + 74);

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

  async function assignTestCases(e) {
    e.preventDefault();
    if (!assignForm.assignedTo) { showToast('Select an assignee', 'info'); return; }
    if (selectedIds.size === 0) { showToast('Select test cases first', 'info'); return; }
    setAssignSaving(true);
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...assignForm,
          type: 'selection',
          testCaseIds: Array.from(selectedIds),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`Assigned ${data.testCaseCount} test cases to ${assignForm.assignedTo}`, 'success');
      setShowAssignModal(false);
      setAssignForm({ assignedTo: '', priority: 'Medium', dueDate: '', notes: '', title: '' });
      setSelectedIds(new Set());
      fetchPage(page);
    } catch (err) {
      showToast(err.message || 'Assignment failed', 'error');
    } finally {
      setAssignSaving(false);
    }
  }

  const filteredModules = fApp ? modules.filter((m) => m.applicationId === fApp) : modules;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageIds = cases.map((t) => t._id);
  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id));
  const allPageSelected = pageIds.length > 0 && selectedOnPage.length === pageIds.length;
  const somePageSelected = selectedOnPage.length > 0 && !allPageSelected;

  const clearBtn = (onClick) => (
    <button onClick={onClick} title="Clear" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
  );

  return (
    <div>
      <ToastProvider />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div className="page-eyebrow">Data Grid</div>
          <h1 className="page-title">Test Cases</h1>
          <p className="page-sub">{loading ? 'Loading…' : `${totalCount} rows`}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>+ Add Test Case</button>
          {isAdmin && (
            <button className="btn btn-danger btn-sm" onClick={clearAll}>Clear All Data</button>
          )}
        </div>
      </div>

      {/* Bulk Fill */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3 style={{ margin: 0 }}>Bulk Fill</h3>
            {selectedIds.size > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '2px 10px', fontWeight: 600 }}>
                  {selectedIds.size} selected
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 13, marginLeft: 6, padding: 0, lineHeight: 1, opacity: 0.8 }}
                    title="Clear selection"
                  >×</button>
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowAssignModal(true)}
                  style={{ fontSize: 12, padding: '3px 10px' }}
                >◷ Assign</button>
              </span>
            )}
          </div>
          <button
            onClick={() => { setBStatus(''); setBFromTester(''); setBTester(''); setBDate(''); setBVersion(''); setBPriority(''); }}
            title="Clear bulk fill fields"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
          >×</button>
        </div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
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
              <label className="field-label">Priority</label>
              <select
                className="field-select"
                value={bPriority}
                onChange={(e) => setBPriority(e.target.value)}
                style={{
                  ...(bPriority === 'High'   && { borderColor: '#dc2626', color: '#dc2626', fontWeight: 600 }),
                  ...(bPriority === 'Medium' && { borderColor: '#d97706', color: '#d97706', fontWeight: 600 }),
                  ...(bPriority === 'Low'    && { borderColor: '#16a34a', color: '#16a34a', fontWeight: 600 }),
                }}
              >
                <option value="">No change</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, alignItems: 'end' }}>
            <div className="field-group">
              <label className="field-label">Fill Date</label>
              <input className="field-input" type="date" value={bDate} onChange={(e) => setBDate(e.target.value)} />
            </div>
            <div className="field-group">
              <label className="field-label">Fill Version</label>
              <input className="field-input" type="text" value={bVersion} onChange={(e) => handleVersionChange(e.target.value)} placeholder="e.g. 2.4.1" />
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => bulkFill(true)}
              disabled={bulkLoading}
              style={{
                ...(bStatus === 'Pass' && { background: '#16a34a', borderColor: '#16a34a', color: '#fff' }),
                ...(bStatus === 'Fail' && { background: '#dc2626', borderColor: '#dc2626', color: '#fff' }),
                ...(bStatus === 'Pending' && { background: '#d97706', borderColor: '#d97706', color: '#fff' }),
              }}
            >
              {bStatus ? `${bStatus}: Pending Rows` : 'Fill Pending'}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => bulkFill(false)}
              disabled={bulkLoading}
              style={{
                ...(bStatus === 'Pass' && { background: '#16a34a', borderColor: '#16a34a' }),
                ...(bStatus === 'Fail' && { background: '#dc2626', borderColor: '#dc2626' }),
                ...(bStatus === 'Pending' && { background: '#d97706', borderColor: '#d97706' }),
              }}
            >
              {selectedIds.size > 0
                ? `${bStatus || 'Fill'}: Selected (${selectedIds.size})`
                : bStatus ? `${bStatus}: All Visible` : 'Fill Visible'}
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Edit — shown when rows are selected */}
      {selectedIds.size > 0 && (
        <div className="panel" style={{ marginBottom: 16, borderColor: 'var(--accent)', borderWidth: 1, borderStyle: 'solid' }}>
          <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>
              Bulk Edit
              <span style={{ fontSize: 12, background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '2px 9px', fontWeight: 600, marginLeft: 10 }}>
                {selectedIds.size} selected
              </span>
            </h3>
            <button
              onClick={() => { setBePriority(''); setBeJiraStory(''); setBeApplication(''); setBeModule(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
              title="Clear bulk edit fields"
            >×</button>
          </div>
          <div className="panel-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, alignItems: 'end' }}>
              <div className="field-group">
                <label className="field-label">Application</label>
                <select className="field-select" value={beApplication}
                  onChange={(e) => { setBeApplication(e.target.value); setBeModule(''); }}>
                  <option value="">No change</option>
                  {applications.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Module</label>
                <select className="field-select" value={beModule} onChange={(e) => setBeModule(e.target.value)}>
                  <option value="">No change</option>
                  {(beApplication ? modules.filter((m) => m.applicationId === beApplication) : modules)
                    .map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Priority</label>
                <select className="field-select" value={bePriority} onChange={(e) => setBePriority(e.target.value)}>
                  <option value="">No change</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Jira Story</label>
                <input className="field-input" type="text" value={beJiraStory}
                  onChange={(e) => setBeJiraStory(e.target.value)}
                  placeholder="e.g. JIRA-123" />
              </div>
              <div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={bulkEdit}
                  disabled={bulkEditLoading}
                >
                  {bulkEditLoading ? 'Saving…' : `Apply to ${selectedIds.size} rows`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header" style={{ paddingTop: 12, paddingBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Filters</h3>
        </div>
        <div className="panel-body" style={{ padding: '14px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <div className="field-group">
              <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                Application
                {fApp && clearBtn(() => { setFApp(''); setFMod(''); })}
              </label>
              <select className="field-select" value={fApp} onChange={(e) => { setFApp(e.target.value); setFMod(''); }}>
                <option value="">All</option>
                {applications.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                Module
                {fMod && clearBtn(() => setFMod(''))}
              </label>
              <select className="field-select" value={fMod} onChange={(e) => setFMod(e.target.value)}>
                <option value="">All</option>
                {filteredModules.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                Status
                {fStatus && clearBtn(() => setFStatus(''))}
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
                Priority
                {fPriority && clearBtn(() => setFPriority(''))}
              </label>
              <select className="field-select" value={fPriority} onChange={(e) => setFPriority(e.target.value)}>
                <option value="">All</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                Tested By
                {fTester && clearBtn(() => setFTester(''))}
              </label>
              <select className="field-select" value={fTester} onChange={(e) => setFTester(e.target.value)}>
                <option value="">All</option>
                <option value="__unassigned__">Unassigned</option>
                {qaUsers.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                Assigned To
                {fAssignedTo && clearBtn(() => setFAssignedTo(''))}
              </label>
              <select className="field-select" value={fAssignedTo} onChange={(e) => setFAssignedTo(e.target.value)}>
                <option value="">All</option>
                <option value="__unassigned__">Unassigned</option>
                {qaUsers.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Version</label>
              <input className="field-input" type="search" value={fVersion} onChange={(e) => setFVersion(e.target.value)} placeholder="Any version" />
            </div>
            <div className="field-group">
              <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                Jira Story
                {fJiraStory && clearBtn(() => setFJiraStory(''))}
              </label>
              <input className="field-input" type="search" value={fJiraStory} onChange={(e) => setFJiraStory(e.target.value)} placeholder="e.g. JIRA-123" />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="panel">
        <div className="table-wrap">
          {loading ? (
            <div className="empty-state">Loading test cases…</div>
          ) : totalCount === 0 ? (
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
                  <th style={{ width: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>#</th>
                  {['Platform','Module','Priority','Type','Jira Story','Traceability','Test Case ID','Test Case','Preconditions',
                    'Steps','Expected Result','Actual Result','Status','Defects','Tested By','Tested On','Version',''].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cases.map((tc, index) => (
                  <TestCaseRow
                    key={tc._id}
                    tc={tc}
                    rowNum={(page - 1) * PAGE_SIZE + index + 1}
                    saving={!!saving[tc._id]}
                    onSave={saveField}
                    onEdit={openEdit}
                    selected={selectedIds.has(tc._id)}
                    onToggle={() => toggleSelect(tc._id)}
                    qaUsers={qaUsers}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!loading && totalCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--muted)' }}>
            <span>
              Rows {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => goToPage(Math.max(1, page - 1))}
                disabled={page === 1}
              >← Prev</button>
              <span style={{ padding: '0 8px' }}>Page {page} of {totalPages}</span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => goToPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
              >Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* Add Test Case Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }} onClick={(e) => { if (e.target === e.currentTarget) { setShowAddModal(false); setAddForm(EMPTY_FORM); setNewModuleName(null); } }}>
          <div style={{
            background: '#ffffff', borderRadius: 12, width: '100%', maxWidth: 720,
            maxHeight: '90vh', overflow: 'auto',
            boxShadow: '0 24px 48px rgba(0,0,0,0.25)',
          }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Add Test Case</h2>
              <button onClick={() => { setShowAddModal(false); setAddForm(EMPTY_FORM); setNewModuleName(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)', lineHeight: 1 }}>×</button>
            </div>
            <form onSubmit={addTestCase} style={{ padding: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div className="field-group">
                  <label className="field-label">Application *</label>
                  <select className="field-select" required value={addForm.applicationId}
                    onChange={(e) => setAddForm((f) => ({ ...f, applicationId: e.target.value, moduleId: '' }))}>
                    <option value="">Select application</option>
                    {applications.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">Module *</label>
                  <select className="field-select" required value={addForm.moduleId}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setAddForm((f) => ({ ...f, moduleId: '' }));
                        setNewModuleName('');
                        setTimeout(() => document.getElementById('new-module-input')?.focus(), 50);
                      } else {
                        setAddForm((f) => ({ ...f, moduleId: e.target.value }));
                        setNewModuleName(null);
                      }
                    }}>
                    <option value="">Select module</option>
                    <option value="__new__">+ Add new module…</option>
                    {modules.filter((m) => !addForm.applicationId || m.applicationId === addForm.applicationId)
                      .map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
                  </select>
                  {newModuleName !== null && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <input
                        id="new-module-input"
                        className="field-input"
                        value={newModuleName}
                        onChange={(e) => setNewModuleName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createModule(); } }}
                        placeholder="New module name"
                        style={{ flex: 1 }}
                      />
                      <button type="button" className="btn btn-primary btn-sm" onClick={createModule}
                        disabled={creatingModule || !newModuleName.trim()} style={{ whiteSpace: 'nowrap' }}>
                        {creatingModule ? '…' : 'Create'}
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm"
                        onClick={() => setNewModuleName(null)} style={{ padding: '0 8px' }}>×</button>
                    </div>
                  )}
                </div>
                <div className="field-group">
                  <label className="field-label">Test Case ID</label>
                  <input className="field-input" value={addForm.testCaseId} placeholder="e.g. TC-001"
                    onChange={(e) => setAddForm((f) => ({ ...f, testCaseId: e.target.value }))} />
                </div>
                <div className="field-group">
                  <label className="field-label">Type</label>
                  <input className="field-input" value={addForm.type} placeholder="e.g. Functional"
                    onChange={(e) => setAddForm((f) => ({ ...f, type: e.target.value }))} />
                </div>
                <div className="field-group">
                  <label className="field-label">Priority</label>
                  <select className="field-select" value={addForm.priority}
                    onChange={(e) => setAddForm((f) => ({ ...f, priority: e.target.value }))}>
                    <option value="">—</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">Jira Story</label>
                  <input className="field-input" value={addForm.jiraStory} placeholder="e.g. JIRA-123"
                    onChange={(e) => setAddForm((f) => ({ ...f, jiraStory: e.target.value }))} />
                </div>
              </div>
              <div className="field-group" style={{ marginBottom: 14 }}>
                <label className="field-label">Test Case *</label>
                <textarea className="field-input" required rows={2} value={addForm.testCase} placeholder="Describe the test case"
                  onChange={(e) => setAddForm((f) => ({ ...f, testCase: e.target.value }))}
                  style={{ resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div className="field-group">
                  <label className="field-label">Preconditions</label>
                  <RichTextEditor
                    value={addForm.preconditions}
                    onChange={(v) => setAddForm((f) => ({ ...f, preconditions: v }))}
                    placeholder="List any preconditions…"
                    minHeight={72}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Steps</label>
                  <RichTextEditor
                    value={addForm.steps}
                    onChange={(v) => setAddForm((f) => ({ ...f, steps: v }))}
                    placeholder="1. Step one&#10;2. Step two…"
                    minHeight={72}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Expected Result *</label>
                  <RichTextEditor
                    value={addForm.expectedResult}
                    onChange={(v) => setAddForm((f) => ({ ...f, expectedResult: v }))}
                    placeholder="Describe the expected outcome…"
                    minHeight={72}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Actual Result</label>
                  <RichTextEditor
                    value={addForm.actualResult}
                    onChange={(v) => setAddForm((f) => ({ ...f, actualResult: v }))}
                    placeholder="Describe the actual outcome…"
                    minHeight={72}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
                <div className="field-group">
                  <label className="field-label">Status</label>
                  <select className="field-select" value={addForm.status}
                    onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value }))}>
                    <option value="">Pending</option>
                    <option value="Pass">Pass</option>
                    <option value="Fail">Fail</option>
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">Tested By</label>
                  <select className="field-select" value={addForm.testedBy}
                    onChange={(e) => setAddForm((f) => ({ ...f, testedBy: e.target.value }))}>
                    <option value="">—</option>
                    {qaUsers.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">Tested On</label>
                  <input className="field-input" type="date" value={addForm.testedOn}
                    onChange={(e) => setAddForm((f) => ({ ...f, testedOn: e.target.value }))} />
                </div>
                <div className="field-group">
                  <label className="field-label">Version</label>
                  <input className="field-input" value={addForm.softwareVersionTested} placeholder={bVersion || ''}
                    onChange={(e) => setAddForm((f) => ({ ...f, softwareVersionTested: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowAddModal(false); setAddForm(EMPTY_FORM); setNewModuleName(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={addSaving}>
                  {addSaving ? 'Saving…' : 'Add Test Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Test Case Modal */}
      {editTc && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }} onClick={(e) => { if (e.target === e.currentTarget) setEditTc(null); }}>
          <div style={{
            background: '#ffffff', borderRadius: 12, width: '100%', maxWidth: 800,
            maxHeight: '90vh', overflow: 'auto',
            boxShadow: '0 24px 48px rgba(0,0,0,0.25)',
          }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Edit Test Case</h2>
                {editTc.testCaseId && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>{editTc.testCaseId}</p>}
              </div>
              <button onClick={() => setEditTc(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)', lineHeight: 1 }}>×</button>
            </div>
            <form onSubmit={saveEdit} style={{ padding: 24 }}>
              {/* Application, Module, Priority, Jira Story */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div className="field-group">
                  <label className="field-label">Application</label>
                  <select className="field-select" value={editForm.applicationId}
                    onChange={(e) => setEditForm((f) => ({ ...f, applicationId: e.target.value, moduleId: '' }))}>
                    <option value="">—</option>
                    {applications.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">Module</label>
                  <select className="field-select" value={editForm.moduleId}
                    onChange={(e) => setEditForm((f) => ({ ...f, moduleId: e.target.value }))}>
                    <option value="">—</option>
                    {modules.filter((m) => !editForm.applicationId || m.applicationId === editForm.applicationId)
                      .map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">Priority</label>
                  <select className="field-select" value={editForm.priority || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}>
                    <option value="">—</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">Jira Story</label>
                  <input className="field-input" value={editForm.jiraStory || ''} placeholder="e.g. JIRA-123"
                    onChange={(e) => setEditForm((f) => ({ ...f, jiraStory: e.target.value }))} />
                </div>
              </div>
              {/* ID, Type, Traceability */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div className="field-group">
                  <label className="field-label">Test Case ID</label>
                  <input className="field-input" value={editForm.testCaseId || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, testCaseId: e.target.value }))} />
                </div>
                <div className="field-group">
                  <label className="field-label">Type</label>
                  <input className="field-input" value={editForm.type || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))} />
                </div>
                <div className="field-group">
                  <label className="field-label">Traceability</label>
                  <input className="field-input" value={editForm.traceability || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, traceability: e.target.value }))} />
                </div>
              </div>
              {/* Test Case */}
              <div className="field-group" style={{ marginBottom: 14 }}>
                <label className="field-label">Test Case</label>
                <textarea className="field-input" rows={2} value={editForm.testCase || ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, testCase: e.target.value }))}
                  style={{ resize: 'vertical' }} />
              </div>
              {/* Preconditions, Steps */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div className="field-group">
                  <label className="field-label">Preconditions</label>
                  <RichTextEditor
                    value={editForm.preconditions || ''}
                    onChange={(v) => setEditForm((f) => ({ ...f, preconditions: v }))}
                    placeholder="List any preconditions…"
                    minHeight={80}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Steps</label>
                  <RichTextEditor
                    value={editForm.steps || ''}
                    onChange={(v) => setEditForm((f) => ({ ...f, steps: v }))}
                    placeholder="1. Navigate to…"
                    minHeight={80}
                  />
                </div>
              </div>
              {/* Expected, Actual */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div className="field-group">
                  <label className="field-label">Expected Result</label>
                  <RichTextEditor
                    value={editForm.expectedResult || ''}
                    onChange={(v) => setEditForm((f) => ({ ...f, expectedResult: v }))}
                    placeholder="Describe the expected outcome…"
                    minHeight={80}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Actual Result</label>
                  <RichTextEditor
                    value={editForm.actualResult || ''}
                    onChange={(v) => setEditForm((f) => ({ ...f, actualResult: v }))}
                    placeholder="Describe the actual outcome…"
                    minHeight={80}
                  />
                </div>
              </div>
              {/* Defects */}
              <div className="field-group" style={{ marginBottom: 14 }}>
                <label className="field-label">Defects / Improvements</label>
                <input className="field-input" value={editForm.defectsImprovements || ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, defectsImprovements: e.target.value }))} />
              </div>
              {/* Status, Tested By, Tested On, Version */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
                <div className="field-group">
                  <label className="field-label">Status</label>
                  <select className="field-select" value={editForm.status || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
                    <option value="">Pending</option>
                    <option value="Pass">Pass</option>
                    <option value="Fail">Fail</option>
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">Tested By</label>
                  <select className="field-select" value={editForm.testedBy || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, testedBy: e.target.value }))}>
                    <option value="">—</option>
                    {qaUsers.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">Tested On</label>
                  <input className="field-input" type="date" value={toDateInputValue(editForm.testedOn || '')}
                    onChange={(e) => setEditForm((f) => ({ ...f, testedOn: e.target.value }))} />
                </div>
                <div className="field-group">
                  <label className="field-label">Version</label>
                  <input className="field-input" value={editForm.softwareVersionTested || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, softwareVersionTested: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditTc(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={editSaving}>
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Selected Modal */}
      {showAssignModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAssignModal(false); }}
        >
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 460, boxShadow: '0 24px 48px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Assign {selectedIds.size} Test Case{selectedIds.size !== 1 ? 's' : ''}</h3>
              <button onClick={() => setShowAssignModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)', lineHeight: 1 }}>×</button>
            </div>
            <form onSubmit={assignTestCases} style={{ padding: '18px 20px', display: 'grid', gap: 14 }}>
              <div className="field-group">
                <label className="field-label">Title <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
                <input
                  className="field-input"
                  type="text"
                  value={assignForm.title}
                  onChange={(e) => setAssignForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Login flow — sprint 12"
                />
              </div>
              <div className="field-group">
                <label className="field-label">Assign to</label>
                <select
                  className="field-select"
                  value={assignForm.assignedTo}
                  onChange={(e) => setAssignForm((f) => ({ ...f, assignedTo: e.target.value }))}
                  required
                >
                  <option value="">Select team member…</option>
                  {qaUsers.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field-group">
                  <label className="field-label">Priority</label>
                  <select
                    className="field-select"
                    value={assignForm.priority}
                    onChange={(e) => setAssignForm((f) => ({ ...f, priority: e.target.value }))}
                  >
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">Due date</label>
                  <input
                    className="field-input"
                    type="date"
                    value={assignForm.dueDate}
                    onChange={(e) => setAssignForm((f) => ({ ...f, dueDate: e.target.value }))}
                  />
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">Notes</label>
                <textarea
                  className="field-input"
                  rows={2}
                  value={assignForm.notes}
                  onChange={(e) => setAssignForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional context or instructions…"
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={assignSaving || !assignForm.assignedTo}>
                  {assignSaving ? 'Assigning…' : `Assign to ${assignForm.assignedTo || '…'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TestCaseRow({ tc, rowNum, saving, onSave, onEdit, selected, onToggle, qaUsers }) {
  const [local, setLocal] = useState(tc);
  useEffect(() => { setLocal(tc); }, [tc]);

  function handleChange(field, value) {
    setLocal((prev) => ({ ...prev, [field]: value }));
    onSave(tc._id, field, value);
  }

  const st = normalizedStatus(local.status);
  const pStyle = priorityBadgeStyle(local.priority);

  return (
    <tr style={{ opacity: saving ? 0.7 : 1, transition: 'opacity 200ms', background: selected ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined }}>
      <td style={{ width: 36, textAlign: 'center', padding: '4px 6px' }}>
        <input type="checkbox" checked={selected} onChange={onToggle} />
      </td>
      <td style={{ width: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 12, userSelect: 'none' }}>{rowNum}</td>
      <td style={{ color: 'var(--ink-2)', minWidth: 110 }}>{tc.applicationName}</td>
      <td style={{ minWidth: 110 }}>{tc.moduleName}</td>
      <td style={{ minWidth: 90 }}>
        <select
          className="table-select"
          value={local.priority || ''}
          onChange={(e) => handleChange('priority', e.target.value)}
          style={{
            minWidth: 85,
            ...pStyle,
          }}
        >
          <option value="">—</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </td>
      <td>{tc.type}</td>
      <td style={{ minWidth: 110 }}>
        <input
          className="table-input"
          style={{ minWidth: 100 }}
          value={local.jiraStory || ''}
          onChange={(e) => setLocal((prev) => ({ ...prev, jiraStory: e.target.value }))}
          onBlur={(e) => { if (e.target.value !== tc.jiraStory) handleChange('jiraStory', e.target.value); }}
          placeholder="JIRA-…"
        />
      </td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{tc.traceability}</td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>{tc.testCaseId}</td>
      <td style={{ minWidth: 180, maxWidth: 220, fontSize: 12 }}>{tc.testCase}</td>
      <td style={{ minWidth: 160, maxWidth: 220 }}>
        <RichTextDisplay value={tc.preconditions} style={{ color: 'var(--muted)' }} />
      </td>
      <td style={{ minWidth: 160, maxWidth: 240 }}>
        <RichTextDisplay value={tc.steps} />
      </td>
      <td style={{ minWidth: 180, maxWidth: 240 }}>
        <RichTextDisplay value={tc.expectedResult} />
      </td>
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
      <td style={{ textAlign: 'center', padding: '4px 8px' }}>
        <button
          onClick={() => onEdit(tc)}
          title="Edit test case"
          style={{
            background: 'none', border: '1px solid var(--line)', borderRadius: 6,
            cursor: 'pointer', padding: '3px 8px', fontSize: 13, color: 'var(--muted)',
            lineHeight: 1,
          }}
        >✎</button>
      </td>
    </tr>
  );
}
