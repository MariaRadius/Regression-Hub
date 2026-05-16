'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './globals.css';

const NAV = [
  { href: '/dashboard',    label: 'Dashboard',     icon: '◈' },
  { href: '/test-cases',   label: 'Test Cases',     icon: '◎' },
  { href: '/applications', label: 'Applications',   icon: '▣' },
  { href: '/modules',      label: 'Modules',        icon: '⊞' },
  { href: '/test-runs',    label: 'Test Runs',      icon: '⟳' },
  { href: '/reports',      label: 'Reports',        icon: '⊟' },
];

export default function RootLayout({ children }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <html lang="en">
      <head>
        <title>QA Regression Hub</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="app-shell">
          <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
            <div className="brand">
              <div className="brand-mark">QA</div>
              {sidebarOpen && (
                <div className="brand-text">
                  <h1>Regression Hub</h1>
                  <p>Testing management</p>
                </div>
              )}
              <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar">
                {sidebarOpen ? '‹' : '›'}
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
                  {sidebarOpen && <span className="nav-label">{label}</span>}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="workspace">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
