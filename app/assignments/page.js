'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ToastProvider, { showToast } from '@/components/Toast';

const PRIORITY_COLOR = {
  High:   { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
  Medium: { bg: '#fffbeb', border: '#fcd34d', text: '#d97706' },
  Low:    { bg: '#f0fdf4', border: '#86efac', text: '#16a34a' },
};

function priorityBadge(priority) {
  const c = PRIORITY_COLOR[priority] || PRIORITY_COLOR.Medium;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 700,
      background: c.bg,
      border: `1px solid ${c.border}`,
      color: c.text,
      letterSpacing: '0.04em',
    }}>
      {priority || 'Medium'}
    </span>
  );
}

function ProgressBar({ completed, total }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const color = pct === 100 ? '#16a34a' : pct > 50 ? '#0891b2' : '#d97706';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
        <span>{completed} / {total} tested</span>
        <span style={{ fontWeight: 600, color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function DueDate({ dueDate }) {
  if (!dueDate) return <span style={{ color: 'var(--muted)', fontSize: 12 }}>No due date</span>;
  const due = new Date(dueDate);
  const now = new Date();
  const isOverdue = due < now;
  const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  const label = isOverdue
    ? `Overdue by ${Math.abs(diff)}d`
    : diff === 0 ? 'Due today'
    : diff === 1 ? 'Due tomorrow'
    : `Due in ${diff}d`;
  return (
    <span style={{
      fontSize: 12,
      fontWeight: 600,
      color: isOverdue ? '#dc2626' : diff <= 2 ? '#d97706' : 'var(--muted)',
    }}>
      ◷ {due.toLocaleDateString()} — {label}
    </span>
  );
}

const EMPTY_FORM = {
  title: '', type: 'module', moduleIds: [], testCaseIds: [],
  assignedTo: '', priority: 'Medium', dueDate: '', notes: '',
};

export default function AssignmentsPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [view, setView] = useState('mine');
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modules, setModules] = useState([]);
  const [moduleCounts, setModuleCounts] = useState({});
  const [qaUsers, setQaUsers] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const fetchAssignments = useCallback(async (v) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/assignments?view=${v}`);
      const data = await res.json();
      setAssignments(Array.isArray(data) ? data : []);
    } catch {
      showToast('Failed to load assignments', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssignments(view);
  }, [view, fetchAssignments]);

  // Load modules + settings for the create modal
  useEffect(() => {
    Promise.all([
      fetch('/api/modules').then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()),
    ]).then(([mods, settings]) => {
      setModules(Array.isArray(mods) ? mods : []);
      if (settings.qaUsers?.length) setQaUsers(settings.qaUsers);
    }).catch(() => {});
  }, []);

  // Load module test-case counts for the create modal
  useEffect(() => {
    if (!modules.length) return;
    const ids = modules.map((m) => m._id);
    Promise.all(
      ids.map((id) =>
        fetch(`/api/test-cases?moduleId=${id}&limit=1`)
          .then((r) => r.json())
          .then((d) => [id, d.total || 0])
          .catch(() => [id, 0])
      )
    ).then((pairs) => {
      setModuleCounts(Object.fromEntries(pairs));
    });
  }, [modules]);

  async function createAssignment(e) {
    e.preventDefault();
    if (!form.assignedTo) { showToast('Select an assignee', 'info'); return; }
    if (form.type === 'module' && !form.moduleIds.length) { showToast('Select at least one module', 'info'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`Assignment created — ${data.testCaseCount} test cases`, 'success');
      setShowModal(false);
      setForm(EMPTY_FORM);
      fetchAssignments(view);
    } catch (err) {
      showToast(err.message || 'Failed to create', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function cancelAssignment(id) {
    if (!confirm('Cancel this assignment? The test cases will remain but lose their assignment.')) return;
    try {
      const res = await fetch(`/api/assignments/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('Assignment cancelled', 'info');
      setAssignments((prev) => prev.filter((a) => a._id !== id));
    } catch (err) {
      showToast(err.message || 'Failed to cancel', 'error');
    }
  }

  async function saveEdit(id) {
    try {
      const res = await fetch(`/api/assignments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('Updated', 'success');
      setEditId(null);
      fetchAssignments(view);
    } catch (err) {
      showToast(err.message || 'Failed to update', 'error');
    }
  }

  function viewCases(a) {
    router.push(`/test-cases?assignedTo=${encodeURIComponent(a.assignedTo)}`);
  }

  const active = assignments.filter((a) => a.status === 'active');
  const cancelled = assignments.filter((a) => a.status !== 'active');

  return (
    <div>
      <ToastProvider />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div className="page-eyebrow">Team</div>
          <h1 className="page-title">Assignments</h1>
          <p className="page-sub">Assign test cases and modules to team members</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setShowModal(true); }}>
          + New Assignment
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--line)', paddingBottom: 0 }}>
        {[
          { key: 'mine', label: `Assigned to Me` },
          { key: 'sent', label: `Assigned by Me` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            style={{
              padding: '8px 18px',
              border: 'none',
              borderBottom: view === key ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: view === key ? 700 : 400,
              color: view === key ? 'var(--accent)' : 'var(--muted)',
              marginBottom: -1,
              borderRadius: '4px 4px 0 0',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Cards */}
      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : active.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 32, marginBottom: 8 }}>◷</div>
          <strong>{view === 'mine' ? 'No assignments for you yet' : 'You haven\'t assigned anything yet'}</strong>
          <p style={{ marginTop: 6, color: 'var(--muted)' }}>
            {view === 'mine' ? 'Ask a team member to assign test cases to you.' : 'Click "New Assignment" to assign a module or test cases.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {active.map((a) => (
            <AssignmentCard
              key={a._id}
              assignment={a}
              isMine={view === 'mine'}
              isSent={view === 'sent'}
              isEditing={editId === a._id}
              editForm={editForm}
              onEdit={() => { setEditId(a._id); setEditForm({ title: a.title, notes: a.notes, priority: a.priority, dueDate: a.dueDate ? a.dueDate.slice(0, 10) : '' }); }}
              onEditChange={(f) => setEditForm((prev) => ({ ...prev, ...f }))}
              onSaveEdit={() => saveEdit(a._id)}
              onCancelEdit={() => setEditId(null)}
              onCancel={() => cancelAssignment(a._id)}
              onViewCases={() => viewCases(a)}
              currentUser={session?.user?.name}
            />
          ))}
        </div>
      )}

      {cancelled.length > 0 && (
        <details style={{ marginTop: 24 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 13, fontWeight: 600, userSelect: 'none' }}>
            {cancelled.length} cancelled assignment{cancelled.length !== 1 ? 's' : ''}
          </summary>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            {cancelled.map((a) => (
              <div key={a._id} className="panel" style={{ opacity: 0.55, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {a.assignedBy} → {a.assignedTo} · {a.testCaseCount} cases · Cancelled
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Create Assignment Modal */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowModal(false); setForm(EMPTY_FORM); } }}
        >
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 48px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>New Assignment</h2>
              <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)', lineHeight: 1 }}>×</button>
            </div>
            <form onSubmit={createAssignment} style={{ padding: '20px 24px' }}>
              <div style={{ display: 'grid', gap: 16 }}>

                {/* Title */}
                <div className="field-group">
                  <label className="field-label">Title <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
                  <input
                    className="field-input"
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Auth Module — v2.5 regression"
                  />
                </div>

                {/* Scope: Module or Manual selection */}
                <div className="field-group">
                  <label className="field-label">Scope</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['module', 'selection'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, type: t, moduleIds: [], testCaseIds: [] }))}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: `1.5px solid ${form.type === t ? 'var(--accent)' : 'var(--line)'}`,
                          background: form.type === t ? 'rgba(13,148,136,0.08)' : '#fff',
                          color: form.type === t ? 'var(--accent)' : 'var(--fg)',
                          fontWeight: form.type === t ? 700 : 400,
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        {t === 'module' ? '⊞ By Module' : '◎ By Selection'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Module picker */}
                {form.type === 'module' && (
                  <div className="field-group">
                    <label className="field-label">Modules to assign</label>
                    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8, display: 'grid', gap: 4 }}>
                      {modules.length === 0
                        ? <div style={{ color: 'var(--muted)', fontSize: 13, padding: 8 }}>No modules found</div>
                        : modules.map((m) => {
                          const checked = form.moduleIds.includes(m._id);
                          const count = moduleCounts[m._id] ?? '…';
                          return (
                            <label key={m._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: checked ? 'rgba(13,148,136,0.06)' : 'transparent', border: checked ? '1px solid rgba(13,148,136,0.2)' : '1px solid transparent' }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => setForm((f) => ({
                                  ...f,
                                  moduleIds: checked ? f.moduleIds.filter((id) => id !== m._id) : [...f.moduleIds, m._id],
                                }))}
                              />
                              <span style={{ flex: 1, fontSize: 13 }}>
                                <span style={{ color: 'var(--muted)', fontSize: 11 }}>{m.applicationName} /</span> {m.name}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{count} cases</span>
                            </label>
                          );
                        })
                      }
                    </div>
                  </div>
                )}

                {form.type === 'selection' && (
                  <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13, color: 'var(--muted)' }}>
                    To assign specific test cases, select them on the <strong style={{ color: 'var(--fg)' }}>Test Cases</strong> page and click the <strong style={{ color: 'var(--accent)' }}>Assign</strong> button.
                  </div>
                )}

                {/* Assignee */}
                <div className="field-group">
                  <label className="field-label">Assign to</label>
                  <select
                    className="field-select"
                    value={form.assignedTo}
                    onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
                    required
                  >
                    <option value="">Select team member…</option>
                    {qaUsers.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                {/* Priority + Due Date */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field-group">
                    <label className="field-label">Priority</label>
                    <select
                      className="field-select"
                      value={form.priority}
                      onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Due date <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
                    <input
                      className="field-input"
                      type="date"
                      value={form.dueDate}
                      onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="field-group">
                  <label className="field-label">Notes <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
                  <textarea
                    className="field-input"
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Instructions, context, or special focus areas…"
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setForm(EMPTY_FORM); }}>Cancel</button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving || (form.type === 'module' && !form.moduleIds.length) || !form.assignedTo}
                >
                  {saving ? 'Creating…' : 'Create Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AssignmentCard({ assignment: a, isMine, isSent, isEditing, editForm, onEdit, onEditChange, onSaveEdit, onCancelEdit, onCancel, onViewCases, currentUser }) {
  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Priority stripe */}
      <div style={{
        height: 4,
        background: a.priority === 'High' ? '#dc2626' : a.priority === 'Low' ? '#16a34a' : '#d97706',
      }} />

      <div style={{ padding: '16px 20px' }}>
        {isEditing ? (
          /* Edit mode */
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="field-group">
              <label className="field-label">Title</label>
              <input className="field-input" value={editForm.title || ''} onChange={(e) => onEditChange({ title: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field-group">
                <label className="field-label">Priority</label>
                <select className="field-select" value={editForm.priority || 'Medium'} onChange={(e) => onEditChange({ priority: e.target.value })}>
                  <option>High</option><option>Medium</option><option>Low</option>
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Due date</label>
                <input className="field-input" type="date" value={editForm.dueDate || ''} onChange={(e) => onEditChange({ dueDate: e.target.value })} />
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Notes</label>
              <textarea className="field-input" rows={2} value={editForm.notes || ''} onChange={(e) => onEditChange({ notes: e.target.value })} style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={onCancelEdit}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={onSaveEdit}>Save</button>
            </div>
          </div>
        ) : (
          /* View mode */
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{a.title}</span>
                  {priorityBadge(a.priority)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                  {isMine && <span>From: <strong style={{ color: 'var(--fg)' }}>{a.assignedBy}</strong></span>}
                  {isSent && <span>To: <strong style={{ color: 'var(--fg)' }}>{a.assignedTo}</strong></span>}
                  <span>
                    {a.type === 'module' ? `⊞ ${a.moduleIds?.length || 1} module${(a.moduleIds?.length || 1) !== 1 ? 's' : ''}` : '◎ Selection'}
                    · {a.testCaseCount} test case{a.testCaseCount !== 1 ? 's' : ''}
                  </span>
                  <DueDate dueDate={a.dueDate} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {isSent && (
                  <button className="btn btn-secondary btn-sm" onClick={onEdit} title="Edit assignment">✎</button>
                )}
                <button className="btn btn-primary btn-sm" onClick={onViewCases}>View Cases</button>
                {isSent && (
                  <button className="btn btn-danger btn-sm" onClick={onCancel} title="Cancel assignment" style={{ padding: '5px 10px' }}>✕</button>
                )}
              </div>
            </div>

            <ProgressBar completed={a.completedCount} total={a.testCaseCount} />

            {a.notes && (
              <div style={{ marginTop: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, fontSize: 12, color: 'var(--muted)', borderLeft: '3px solid var(--line)' }}>
                {a.notes}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
