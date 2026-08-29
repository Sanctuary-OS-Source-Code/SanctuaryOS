export function getSubdomain(): string | null {
  if (typeof window === 'undefined') return null;
  
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts.length > 0) {
    return pathParts[0];
  }
  
  return null;
}

export function isRootDomain(): boolean {
  return getSubdomain() === null;
}
