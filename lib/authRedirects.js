export function getSafeRedirectTarget(target, fallback = '/dashboard') {
  if (typeof target !== 'string') return fallback;
  if (!target.startsWith('/') || target.startsWith('//')) return fallback;
  return target;
}

export function buildLoginRedirectTarget(pathname, search = '') {
  return `${pathname}${search}` || '/dashboard';
}
