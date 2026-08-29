export function getSubdomain(): string | null {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  
  // IP addresses don't have subdomains
  if (/^[0-9.]+$/.test(host)) return null;

  const parts = host.split('.');
  
  // Handle localhost (e.g. sims4.localhost)
  if (host.includes('localhost')) {
    if (parts.length > 1 && parts[0] !== 'localhost') {
      return parts[0];
    }
    return null;
  }

  // Handle standard domains (assuming 2 parts for base domain, e.g. domain.com)
  if (parts.length >= 3) {
    if (parts[0] !== 'www') {
      return parts[0];
    }
  }
  
  return null;
}

export function isRootDomain(): boolean {
  return getSubdomain() === null;
}
