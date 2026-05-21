'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ToastProvider, { showToast } from '@/components/Toast';

const ROLE_STYLE = {
  admin: { bg: 'rgba(13,148,136,0.12)', border: 'rgba(13,148,136,0.4)', color: '#0d9488', label: 'Admin' },
  qa:    { bg: 'rgba(8,145,178,0.12)',  border: 'rgba(8,145,178,0.4)',  color: '#0891b2', label: 'QA'    },
};

const LOCATION_STYLE = {
  radius: { bg: 'rgba(13,148,136,0.1)', border: 'rgba(13,148,136,0.3)', color: '#0d9488', label: 'Radius' },
  cb:     { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.3)', color: '#6366f1', label: 'CB'     },
};

function RoleBadge({ role }) {
  const s = ROLE_STYLE[role] || ROLE_STYLE.qa;
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
      {s.label}
    </span>
  );
}

function Avatar({ name, role }) {
  const s = ROLE_STYLE[role] || ROLE_STYLE.qa;
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      background: s.bg, border: `2px solid ${s.border}`,
      color: s.color, fontWeight: 700, fontSize: 14,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  );
}

const EMPTY_FORM = { name: '', username: '', password: '', confirmPassword: '', role: 'qa' };
const EMPTY_EDIT = { name: '', role: 'qa' };
const EMPTY_PWD  = { password: '', confirmPassword: '' };

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd]       = useState(false);
  const [addForm, setAddForm]       = useState(EMPTY_FORM);
  const [addSaving, setAddSaving]   = useState(false);

  const [editId, setEditId]         = useState(null);
  const [editForm, setEditForm]     = useState(EMPTY_EDIT);
  const [editSaving, setEditSaving] = useState(false);

  const [pwdId, setPwdId]           = useState(null);
  const [pwdForm, setPwdForm]       = useState(EMPTY_PWD);
  const [pwdSaving, setPwdSaving]   = useState(false);

  // Redirect non-admins away
  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated' || session?.user?.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [session, status, router]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      if (res.status === 403) { router.replace('/dashboard'); return; }
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      showToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (session?.user?.role === 'admin') fetchUsers();
  }, [session, fetchUsers]);

  async function createUser(e) {
    e.preventDefault();
    if (addForm.password !== addForm.confirmPassword) { showToast('Passwords do not match', 'error'); return; }
    setAddSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addForm.name, username: addForm.username, password: addForm.password, role: addForm.role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`User "${addForm.name}" created`, 'success');
      setShowAdd(false);
      setAddForm(EMPTY_FORM);
      fetchUsers();
    } catch (err) {
      showToast(err.message || 'Failed to create user', 'error');
    } finally {
      setAddSaving(false);
    }
  }

  async function saveEdit(id) {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('User updated', 'success');
      setEditId(null);
      fetchUsers();
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
    } finally {
      setEditSaving(false);
    }
  }

  async function savePassword(id) {
    if (pwdForm.password !== pwdForm.confirmPassword) { showToast('Passwords do not match', 'error'); return; }
    setPwdSaving(true);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwdForm.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('Password updated', 'success');
      setPwdId(null);
      setPwdForm(EMPTY_PWD);
    } catch (err) {
      showToast(err.message || 'Password update failed', 'error');
    } finally {
      setPwdSaving(false);
    }
  }

  async function toggleActive(user) {
    const action = user.active !== false ? 'deactivate' : 'activate';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${user.name}?`)) return;
    try {
      const res = await fetch(`/api/users/${user._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: user.active === false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`User ${action}d`, 'success');
      fetchUsers();
    } catch (err) {
      showToast(err.message || 'Action failed', 'error');
    }
  }

  if (status === 'loading' || session?.user?.role !== 'admin') {
    return <div className="empty-state">Loading…</div>;
  }

  const locationStyle = LOCATION_STYLE[session.user.teamId] || LOCATION_STYLE.radius;
  const activeUsers   = users.filter((u) => u.active !== false);
  const inactiveUsers = users.filter((u) => u.active === false);

  return (
    <div>
      <ToastProvider />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div className="page-eyebrow">Admin</div>
          <h1 className="page-title">User Management</h1>
          <p className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: locationStyle.bg, border: `1px solid ${locationStyle.border}`, color: locationStyle.color }}>
              {locationStyle.label}
            </span>
            {activeUsers.length} active · {inactiveUsers.length} inactive
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setAddForm(EMPTY_FORM); setShowAdd(true); }}>
          + Add User
        </button>
      </div>

      {/* Role permissions info */}
      <div className="panel" style={{ marginBottom: 20, background: 'linear-gradient(135deg, rgba(13,148,136,0.04), rgba(8,145,178,0.04))', border: '1px solid rgba(13,148,136,0.15)' }}>
        <div className="panel-body" style={{ padding: '14px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <RoleBadge role="admin" />
                <span style={{ fontWeight: 600, fontSize: 13 }}>Admin</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 3 }}>
                {['Manage users (create, edit, passwords)', 'Import Excel & manage versions', 'Clear all data', 'Full test case access', 'Assignments & reports'].map((item) => (
                  <li key={item} style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <RoleBadge role="qa" />
                <span style={{ fontWeight: 600, fontSize: 13 }}>QA</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 3 }}>
                {['View & fill test case results', 'Manage assignments', 'View reports & dashboard', 'Export data (Excel / PDF)'].map((item) => (
                  <li key={item} style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span> {item}
                  </li>
                ))}
                {['Import Excel', 'Clear data', 'Manage users'].map((item) => (
                  <li key={item} style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: '#dc2626', fontWeight: 700 }}>✗</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <div className="empty-state">Loading users…</div>
      ) : (
        <div className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 44 }}></th>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>No users found</td></tr>
                ) : (
                  users.map((user) => {
                    const isSelf    = user._id === session.user.id;
                    const isActive  = user.active !== false;
                    const isEditing = editId === user._id;

                    return (
                      <tr key={user._id} style={{ opacity: isActive ? 1 : 0.5 }}>
                        <td style={{ padding: '10px 12px' }}>
                          <Avatar name={user.name} role={user.role} />
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              className="field-input"
                              style={{ padding: '4px 8px', fontSize: 13 }}
                              value={editForm.name}
                              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            />
                          ) : (
                            <span style={{ fontWeight: 600 }}>
                              {user.name}
                              {isSelf && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>YOU</span>}
                            </span>
                          )}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>
                          {user.username}
                        </td>
                        <td>
                          {isEditing ? (
                            <select
                              className="field-select"
                              style={{ padding: '4px 8px', fontSize: 13 }}
                              value={editForm.role}
                              onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                            >
                              <option value="admin">Admin</option>
                              <option value="qa">QA</option>
                            </select>
                          ) : (
                            <RoleBadge role={user.role} />
                          )}
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                            background: isActive ? '#f0fdf4' : '#f3f4f6',
                            border: `1px solid ${isActive ? '#bbf7d0' : '#e5e7eb'}`,
                            color: isActive ? '#16a34a' : '#9ca3af',
                          }}>
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button className="btn btn-secondary btn-sm" onClick={() => setEditId(null)}>Cancel</button>
                              <button className="btn btn-primary btn-sm" onClick={() => saveEdit(user._id)} disabled={editSaving}>
                                {editSaving ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => { setEditId(user._id); setEditForm({ name: user.name, role: user.role }); }}
                                title="Edit name / role"
                              >Edit</button>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => { setPwdId(user._id); setPwdForm(EMPTY_PWD); }}
                                title="Change password"
                              >Password</button>
                              {!isSelf && (
                                <button
                                  className={`btn btn-sm ${isActive ? 'btn-danger' : 'btn-secondary'}`}
                                  onClick={() => toggleActive(user)}
                                  title={isActive ? 'Deactivate user' : 'Reactivate user'}
                                  style={{ padding: '5px 10px' }}
                                >
                                  {isActive ? '⊘' : '↺'}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAdd && (
        <Modal title="Add New User" onClose={() => { setShowAdd(false); setAddForm(EMPTY_FORM); }}>
          <form onSubmit={createUser} style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field-group">
                <label className="field-label">Full name</label>
                <input className="field-input" type="text" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Maria" required />
              </div>
              <div className="field-group">
                <label className="field-label">Username</label>
                <input className="field-input" type="text" value={addForm.username} onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} placeholder="e.g. maria" required />
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Role</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['qa', 'admin'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setAddForm((f) => ({ ...f, role: r }))}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                      border: `1.5px solid ${addForm.role === r ? (r === 'admin' ? '#0d9488' : '#0891b2') : 'var(--line)'}`,
                      background: addForm.role === r ? (r === 'admin' ? 'rgba(13,148,136,0.08)' : 'rgba(8,145,178,0.08)') : '#fff',
                      color: addForm.role === r ? (r === 'admin' ? '#0d9488' : '#0891b2') : 'var(--fg)',
                      fontWeight: addForm.role === r ? 700 : 400,
                    }}
                  >
                    {r === 'admin' ? '⚙ Admin' : '◎ QA'}
                  </button>
                ))}
              </div>
              <p style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
                {addForm.role === 'admin' ? 'Can manage users, import Excel, clear data, and manage versions.' : 'Can fill test results, manage assignments, and export data.'}
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field-group">
                <label className="field-label">Password</label>
                <input className="field-input" type="password" value={addForm.password} onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min. 8 characters" required minLength={8} />
              </div>
              <div className="field-group">
                <label className="field-label">Confirm password</label>
                <input className="field-input" type="password" value={addForm.confirmPassword} onChange={(e) => setAddForm((f) => ({ ...f, confirmPassword: e.target.value }))} placeholder="Repeat password" required />
              </div>
            </div>
            <div style={{ padding: '10px 14px', background: 'rgba(13,148,136,0.06)', borderRadius: 8, border: '1px solid rgba(13,148,136,0.2)', fontSize: 12, color: 'var(--muted)' }}>
              This user will be added to the <strong style={{ color: 'var(--fg)' }}>{session.user.teamName}</strong> location and can only see that location's data.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowAdd(false); setAddForm(EMPTY_FORM); }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={addSaving}>
                {addSaving ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Change Password Modal */}
      {pwdId && (
        <Modal title={`Change Password — ${users.find((u) => u._id === pwdId)?.name}`} onClose={() => { setPwdId(null); setPwdForm(EMPTY_PWD); }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="field-group">
              <label className="field-label">New password</label>
              <input className="field-input" type="password" value={pwdForm.password} onChange={(e) => setPwdForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min. 8 characters" />
            </div>
            <div className="field-group">
              <label className="field-label">Confirm password</label>
              <input className="field-input" type="password" value={pwdForm.confirmPassword} onChange={(e) => setPwdForm((f) => ({ ...f, confirmPassword: e.target.value }))} placeholder="Repeat password" />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setPwdId(null); setPwdForm(EMPTY_PWD); }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => savePassword(pwdId)} disabled={pwdSaving || !pwdForm.password || pwdForm.password.length < 8}>
                {pwdSaving ? 'Saving…' : 'Update Password'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 500, boxShadow: '0 24px 48px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '20px' }}>{children}</div>
      </div>
    </div>
  );
}
