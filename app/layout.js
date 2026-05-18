import Sidebar from '@/components/Sidebar';
import SessionWrapper from '@/components/SessionWrapper';
import './globals.css';

export const metadata = {
  title: 'QA Regression Hub',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>
        <SessionWrapper>
          <div className="app-shell">
            <Sidebar />
            <main className="workspace">
              {children}
            </main>
          </div>
        </SessionWrapper>
      </body>
    </html>
  );
}
