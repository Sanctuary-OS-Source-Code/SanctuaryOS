import { isDesktop } from './envUtils';

export type LandingTabId =
  | 'overview'
  | 'workspaces'
  | 'news'
  | 'directives'
  | 'download'
  | 'support'
  | 'partners'
  | 'legal'
  | 'donations';

let currentLandingTabState: LandingTabId = 'overview';

export function normalizeLandingTab(raw?: string | null): LandingTabId {
  const clean = String(raw || '')
    .replace(/^#/, '')
    .trim()
    .toLowerCase();
  if (clean === 'workspaces') return 'workspaces';
  if (
    clean === 'news' ||
    clean === 'sanctuary_foundry_news' ||
    clean === 'release_notes'
  ) {
    return 'news';
  }
  if (clean === 'directives' || clean === 'system_directives') {
    return 'directives';
  }
  if (clean === 'download' || clean === 'downloads') {
    return isDesktop() ? 'overview' : 'download';
  }
  if (
    clean === 'support' ||
    clean === 'feedback' ||
    clean === 'contact'
  ) {
    return 'support';
  }
  if (
    clean === 'partners' ||
    clean === 'partner' ||
    clean === 'spokes' ||
    clean === 'partner_spokes'
  ) {
    return 'partners';
  }
  if (
    clean === 'legal' ||
    clean === 'eula' ||
    clean === 'privacy' ||
    clean === 'terms'
  ) {
    return 'legal';
  }
  if (clean === 'donations' || clean === 'donate') {
    return 'donations';
  }
  return 'overview';
}

export function getActiveLandingTab(): LandingTabId {
  return currentLandingTabState;
}

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
  const resolvedTab = normalizeLandingTab(sectionId);
  currentLandingTabState = resolvedTab;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('sanctuary-landing-tab', {
        detail: { tab: resolvedTab, sectionId },
      })
    );
  }

  const subSectionTargets = ['feedback', 'contact', 'support', 'release_notes'];
  const cleanId = String(sectionId || '').replace(/^#/, '').trim().toLowerCase();

  setTimeout(() => {
    const scrollContainer = document.getElementById('sanctuary-main-scroll');
    if (subSectionTargets.includes(cleanId)) {
      const target = document.getElementById(cleanId);
      if (target && scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const offset =
          targetRect.top - containerRect.top + scrollContainer.scrollTop - 24;
        scrollContainer.scrollTo({
          top: Math.max(0, offset),
          behavior: 'smooth',
        });
        return;
      }
    }
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, 40);
}

