'use client';

import Link from '@mui/material/Link';
import NextLink from 'next/link';

export default function AppLink({
  href,
  children,
  underline = 'hover',
  color = 'inherit',
  ...props
}) {
  return (
    <Link
      component={NextLink}
      href={href}
      underline={underline}
      color={color}
      {...props}
    >
      {children}
    </Link>
  );
}
