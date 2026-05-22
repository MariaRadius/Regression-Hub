import NextTopLoader from 'nextjs-toploader';
import SessionWrapper from '@/components/SessionWrapper';
import { fontVariables } from './fonts';
import './globals.css';

export const metadata = {
  title: 'QA Regression Hub',
};

export default function RootLayout({ children }) {
  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <link rel='icon' href='/favicon.svg' type='image/svg+xml' />
      </head>
      <body className={fontVariables} suppressHydrationWarning>
        <NextTopLoader color='#0d9488' showSpinner={false} />
        <SessionWrapper>{children}</SessionWrapper>
      </body>
    </html>
  );
}
