'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

const NAV = [
  { href: '/dashboard',    label: 'Dashboard',    icon: '◈' },
  { href: '/test-cases',   label: 'Test Cases',   icon: '◎' },
  { href: '/applications', label: 'Applications', icon: '▣' },
  { href: '/modules',      label: 'Modules',      icon: '⊞' },
  { href: '/assignments',  label: 'Assignments',  icon: '◷' },
  { href: '/test-runs',    label: 'Test Runs',    icon: '⟳' },
  { href: '/reports',      label: 'Reports',      icon: '⊟' },
];

const ADMIN_NAV = [
  { href: '/users', label: 'Users', icon: '◉' },
];

const LOCATION_COLOR = {
  radius: '#0d9488',
  cb:     '#6366f1',
};

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const { data: session } = useSession();

  if (pathname === '/login') return null;

  return (
    <aside className={`sidebar ${open ? 'open' : 'collapsed'}`}>
      <div className="brand">
        {open ? (
          <>
            <div className="brand-mark">QA</div>
            <div className="brand-text">
              <h1>Regression Hub</h1>
              <p>Testing management</p>
            </div>
            <button className="sidebar-toggle" onClick={() => setOpen(false)} aria-label="Collapse sidebar">‹</button>
          </>
        ) : (
          <button
            onClick={() => setOpen(true)}
            aria-label="Expand sidebar"
            title="Expand"
            style={{
              background: 'linear-gradient(135deg, #0d9488, #0891b2)',
              border: 'none', cursor: 'pointer',
              width: 36, height: 36, borderRadius: 8,
              color: '#fff', fontWeight: 700, fontSize: 13,
              display: 'grid', placeItems: 'center',
              margin: '0 auto', letterSpacing: '0.5px',
            }}
          >QA</button>
        )}
      </div>

      <nav>
        {NAV.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={`nav-item ${pathname === href || pathname.startsWith(href + '/') ? 'active' : ''}`}
          >
            <span className="nav-icon">{icon}</span>
            {open && <span className="nav-label">{label}</span>}
          </Link>
        ))}
        {session?.user?.role === 'admin' && (
          <>
            {open && (
              <div style={{ margin: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Admin
              </div>
            )}
            {ADMIN_NAV.map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className={`nav-item ${pathname === href || pathname.startsWith(href + '/') ? 'active' : ''}`}
              >
                <span className="nav-icon">{icon}</span>
                {open && <span className="nav-label">{label}</span>}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* User info + logout at the bottom */}
      <div style={{
        marginTop: 'auto',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: open ? '14px 16px' : '14px 8px',
      }}>
        {session && open && (
          <div style={{ marginBottom: 10 }}>
            <div style={{
              fontSize: 11, fontWeight: 600,
              color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
            }}>
              Signed in as
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 5 }}>
              {session.user.name}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {/* Location badge */}
              <span style={{
                padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: `${LOCATION_COLOR[session.user.teamId] || '#0d9488'}33`,
                border: `1px solid ${LOCATION_COLOR[session.user.teamId] || '#0d9488'}80`,
                color: LOCATION_COLOR[session.user.teamId] || '#5eead4',
              }}>
                {session.user.teamName}
              </span>
              {/* Role badge */}
              <span style={{
                padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                background: session.user.role === 'admin' ? 'rgba(13,148,136,0.2)' : 'rgba(8,145,178,0.2)',
                border: `1px solid ${session.user.role === 'admin' ? 'rgba(13,148,136,0.5)' : 'rgba(8,145,178,0.5)'}`,
                color: session.user.role === 'admin' ? '#5eead4' : '#7dd3fc',
              }}>
                {session.user.role === 'admin' ? '⚙ Admin' : '◎ QA'}
              </span>
            </div>
          </div>
        )}

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          title="Sign out"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '8px 10px',
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 8,
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
        >
          <span style={{ fontSize: 15 }}>⎋</span>
          {open && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
