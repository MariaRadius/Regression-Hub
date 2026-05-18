'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

const NAV = [
  { href: '/dashboard',    label: 'Dashboard',   icon: '◈' },
  { href: '/test-cases',   label: 'Test Cases',  icon: '◎' },
  { href: '/applications', label: 'Applications', icon: '▣' },
  { href: '/modules',      label: 'Modules',     icon: '⊞' },
  { href: '/test-runs',    label: 'Test Runs',   icon: '⟳' },
  { href: '/reports',      label: 'Reports',     icon: '⊟' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const { data: session } = useSession();

  if (pathname === '/login') return null;

  return (
    <aside className={`sidebar ${open ? 'open' : 'collapsed'}`}>
      <div className="brand">
        <div className="brand-mark">QA</div>
        {open && (
          <div className="brand-text">
            <h1>Regression Hub</h1>
            <p>Testing management</p>
          </div>
        )}
        <button className="sidebar-toggle" onClick={() => setOpen(!open)} aria-label="Toggle sidebar">
          {open ? '‹' : '›'}
        </button>
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
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 4,
            }}>
              Signed in as
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
              {session.user.name}
            </div>
            <div style={{
              display: 'inline-block',
              marginTop: 4,
              padding: '2px 8px',
              background: 'rgba(13,148,136,0.25)',
              border: '1px solid rgba(13,148,136,0.5)',
              borderRadius: 20,
              fontSize: 11,
              color: '#5eead4',
              fontWeight: 600,
            }}>
              {session.user.teamName}
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
