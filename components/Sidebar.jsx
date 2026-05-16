'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
    </aside>
  );
}
