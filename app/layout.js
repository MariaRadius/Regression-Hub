import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import SessionWrapper from '@/components/SessionWrapper';
import { fontVariables } from './fonts';
import ThemeRegistry from './ThemeRegistry';
import ThemeTopLoader from './ThemeTopLoader';
import './globals.css';

export const metadata = {
  title: 'QA Test Atlas',
};

export default function RootLayout({ children }) {
  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <link rel='icon' href='/favicon.svg' type='image/svg+xml' />
      </head>
      <body className={fontVariables} suppressHydrationWarning>
        <AppRouterCacheProvider options={{ key: 'mui' }}>
          <ThemeRegistry>
            <ThemeTopLoader />
            <SessionWrapper>{children}</SessionWrapper>
          </ThemeRegistry>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
