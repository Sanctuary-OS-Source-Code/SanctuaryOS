export function isDesktop(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

export function isLinuxDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  if (
    typeof document !== 'undefined' &&
    document.documentElement?.getAttribute('data-sa-platform') === 'linux'
  ) {
    return true;
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  return isDesktop() && /Linux/i.test(ua) && !/Android/i.test(ua);
}

