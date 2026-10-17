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

export function scrollToLandingSection(sectionId: string): void {
  if (typeof document === 'undefined') return;
  const target =
    document.getElementById(sectionId) ||
    (sectionId === 'news' ? document.getElementById('sanctuary_foundry_news') : null) ||
    (sectionId === 'sanctuary_foundry_news' ? document.getElementById('news') : null);
  if (!target) return;

  const scrollContainer =
    document.getElementById('sanctuary-main-scroll') ||
    (target.closest('main') as HTMLElement | null);
  if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
    const containerRect = scrollContainer.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offset = targetRect.top - containerRect.top + scrollContainer.scrollTop - 24;
    scrollContainer.scrollTo({
      top: Math.max(0, offset),
      behavior: 'smooth',
    });
  } else {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

