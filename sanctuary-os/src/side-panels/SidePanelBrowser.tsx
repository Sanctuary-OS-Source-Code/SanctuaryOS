import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Webview, getAllWebviews } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isDesktop } from '../utils/envUtils';
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  EmptyState,
  ActionButton,
  HoverTooltip,
} from '../shared';
import { useModalStore } from '../store/modalStore';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { useTheme } from '../ThemeContext';
import { INJECTED_BROWSER_SCRIPT } from './browserInjection';
import { SidePanelBrowserDownloads } from './SidePanelBrowserDownloads';

function parseHexRgb(hexStr: string | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!hexStr || hexStr === 'transparent') return fallback;
  const clean = hexStr.replace('#', '').trim();
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
  } else if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
  }
  return fallback;
}

function normalizeUrlForCompare(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  return rawUrl
    .trim()
    .replace(/#sanctuary-(new-tab|action)=.*$/, '')
    .replace(/([?&])sanc_fs=(true|false)&?/, '$1')
    .replace(/[?&]$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function cleanDisplayUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  return rawUrl
    .trim()
    .replace(/#sanctuary-(new-tab|action)=.*$/, '')
    .replace(/([?&])sanc_fs=(true|false)&?/, '$1')
    .replace(/[?&]$/, '');
}

function ensureValidNavUrl(rawInput: string): string {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return 'https://www.google.com';
  if (trimmed === 'about:blank' || /^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes('.') && !trimmed.includes(' ')) {
    return 'https://' + trimmed.replace(/^\/+/, '');
  }
  return 'https://www.google.com/search?q=' + encodeURIComponent(trimmed);
}

function formatReadableUrlTitle(urlStr?: string | null, customTitle?: string | null): string {
  const safeUrl = (urlStr || '').trim();
  const safeCustom = (customTitle || '').trim();
  if (
    safeCustom &&
    safeCustom !== safeUrl &&
    !/^https?:\/\//i.test(safeCustom)
  ) {
    return safeCustom;
  }
  if (!safeUrl) return '';
  try {
    const parsed = new URL(safeUrl.startsWith('http') ? safeUrl : `https://${safeUrl}`);
    const host = parsed.hostname.replace(/^www\./i, '');
    const searchQ = parsed.searchParams.get('q') || parsed.searchParams.get('query');
    if (searchQ) {
      return `${host} — ${searchQ}`;
    }
    const segments = parsed.pathname
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        try {
          return decodeURIComponent(s);
        } catch {
          return s;
        }
      });
    if (segments.length > 0) {
      const tail = segments.slice(-2).join(' / ');
      return `${host} · ${tail}`;
    }
    return host || safeUrl;
  } catch {
    return safeUrl.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '');
  }
}

export default function SidePanelBrowser() {
  const { t } = useLexicon();
  const { currentTheme } = useTheme();
  const { isSideBrowserOpen, setIsSideBrowserOpen, sideBrowserUrl, sideBrowserTrigger, browserTabs, setBrowserTabs, activeBrowserTabId, setActiveBrowserTabId, browserBookmarks, setBrowserBookmarks, browserHistory, setBrowserHistory, maxActiveWebviews, downloadsQueue, setDownloadsQueue, dnaMatchQueue, confirmDialog, bulkModal, localFolderModal, yeetConfirmPending, isBackingUp, isRestoring } = useModalStore();

  // Compute theme-harmonized background colors for the Webview & corner mask
  const browserThemeColors = useMemo(() => {
    const sidebarRgb = parseHexRgb(currentTheme.sidebar || currentTheme.bg, [4, 8, 18]);
    const tintRgb = parseHexRgb(currentTheme.panelTint || currentTheme.sidebar, [6, 13, 31]);
    const accentRgb = parseHexRgb(currentTheme.accent, [56, 189, 248]);
    const lum = (sidebarRgb[0] * 299 + sidebarRgb[1] * 587 + sidebarRgb[2] * 114) / 1000;
    const isLight = lum > 140;

    // Frame color matches the SidePanel's smoked drawer surface
    const frameR = Math.round(sidebarRgb[0] * 0.65 + tintRgb[0] * 0.35);
    const frameG = Math.round(sidebarRgb[1] * 0.65 + tintRgb[1] * 0.35);
    const frameB = Math.round(sidebarRgb[2] * 0.65 + tintRgb[2] * 0.35);

    // Harmonized surface color used to tint chalky #202124 website backgrounds
    const bgR = Math.round(tintRgb[0] * 0.65 + sidebarRgb[0] * 0.35);
    const bgG = Math.round(tintRgb[1] * 0.65 + sidebarRgb[1] * 0.35);
    const bgB = Math.round(tintRgb[2] * 0.65 + sidebarRgb[2] * 0.35);

    return {
      isLight,
      frameR,
      frameG,
      frameB,
      bgR,
      bgG,
      bgB,
      accentR: accentRgb[0],
      accentG: accentRgb[1],
      accentB: accentRgb[2],
      frameCss: `rgb(${frameR}, ${frameG}, ${frameB})`,
      bgCss: `rgb(${bgR}, ${bgG}, ${bgB})`,
      wvBgTuple: [bgR, bgG, bgB, 255] as [number, number, number, number],
    };
  }, [currentTheme.sidebar, currentTheme.bg, currentTheme.panelTint, currentTheme.accent]);

  const wvBgTupleRef = useRef(browserThemeColors.wvBgTuple);
  wvBgTupleRef.current = browserThemeColors.wvBgTuple;

  const isBlockingModalOpen =
    dnaMatchQueue.length > 0 ||
    !!confirmDialog ||
    bulkModal ||
    localFolderModal ||
    !!yeetConfirmPending ||
    isBackingUp ||
    isRestoring;

  const blockingModalRef = useRef(isBlockingModalOpen);

  useEffect(() => {
    blockingModalRef.current = isBlockingModalOpen;
    window.dispatchEvent(new Event('resize'));
    if (isBlockingModalOpen && isSideBrowserOpen) {
      setIsSideBrowserOpen(false);
    }

    if (!isSideBrowserOpen || isBlockingModalOpen) {
      setBrowserTabs((prev: any[]) => {
        if (prev.some((tab) => !tab.sleeping)) {
          return prev.map((tab) => ({ ...tab, sleeping: true }));
        }
        return prev;
      });
    } else if (isSideBrowserOpen && !isBlockingModalOpen && activeBrowserTabId) {
      setBrowserTabs((prev: any[]) => {
        if (prev.some((tab) => tab.id === activeBrowserTabId && tab.sleeping)) {
          return prev.map((tab) =>
            tab.id === activeBrowserTabId ? { ...tab, sleeping: false } : tab
          );
        }
        return prev;
      });
    }
  }, [
    isBlockingModalOpen,
    isSideBrowserOpen,
    activeBrowserTabId,
    setIsSideBrowserOpen,
    setBrowserTabs,
  ]);

  const [localUrlInput, setLocalUrlInput] = useState('');
  const isUrlInputFocusedRef = useRef(false);

  const webviewsRef = useRef<Map<string, Webview>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const bridgeTokenRef = useRef<string>(crypto.randomUUID());

  const [hasInitialized, setHasInitialized] = useState(false);

  const actualUrlRef = useRef(localUrlInput);
  const [actualCurrentUrl, setActualCurrentUrl] = useState(localUrlInput);
  const [isBookmarksDropdownOpen, setIsBookmarksDropdownOpen] = useState(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'bookmarks' | 'history'>('bookmarks');
  const [searchQuery, setSearchQuery] = useState('');

  const [editingBookmarkUrl, setEditingBookmarkUrl] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [expandedHistoryDays, setExpandedHistoryDays] = useState<Record<string, boolean>>({});

  const recordHistoryVisit = useCallback((rawUrl: string, customTitle?: string) => {
    const cleanUrl = cleanDisplayUrl(rawUrl);
    if (!cleanUrl || cleanUrl === 'about:blank' || !/^https?:\/\//i.test(cleanUrl)) return;

    useModalStore.getState().setBrowserHistory((prev: any[]) => {
      const safePrev = Array.isArray(prev)
        ? prev.filter(
            (item) =>
              item &&
              typeof item.url === 'string' &&
              item.url !== 'about:blank' &&
              /^https?:\/\//i.test(item.url)
          )
        : [];
      const targetNorm = normalizeUrlForCompare(cleanUrl);
      if (safePrev.length > 0 && normalizeUrlForCompare(safePrev[0].url) === targetNorm) {
        return safePrev;
      }
      const readableTitle = formatReadableUrlTitle(cleanUrl, customTitle);
      const dedupedRecent = safePrev.filter(
        (item, idx) => !(idx < 8 && normalizeUrlForCompare(item.url) === targetNorm)
      );
      return [
        { url: cleanUrl, title: readableTitle, timestamp: Date.now() },
        ...dedupedRecent,
      ].slice(0, 100);
    });
  }, []);

  const openUrlInNewTab = useCallback(
    (targetUrl: string) => {
      const validUrl = ensureValidNavUrl(targetUrl);
      const newId = crypto.randomUUID();
      setBrowserTabs((prev: any[]) => [
        ...prev,
        { id: newId, url: validUrl, title: formatReadableUrlTitle(validUrl), sleeping: false },
      ]);
      setActiveBrowserTabId(newId);
      actualUrlRef.current = validUrl;
      setActualCurrentUrl(validUrl);
      setLocalUrlInput(validUrl);
      recordHistoryVisit(validUrl);
    },
    [setBrowserTabs, setActiveBrowserTabId, recordHistoryVisit]
  );

  // Keep native Webview bounds in sync when sidebars, downloads, or fullscreen states toggle
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
    const t1 = setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    const t2 = setTimeout(() => window.dispatchEvent(new Event('resize')), 200);
    const t3 = setTimeout(() => window.dispatchEvent(new Event('resize')), 360);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isBookmarksDropdownOpen, isBrowserFullscreen, downloadsQueue.length, isSideBrowserOpen]);

  const buildInjectedScript = useCallback(() => {
    return INJECTED_BROWSER_SCRIPT
      .replace(/__OS_BG_R__/g, String(browserThemeColors.bgR))
      .replace(/__OS_BG_G__/g, String(browserThemeColors.bgG))
      .replace(/__OS_BG_B__/g, String(browserThemeColors.bgB))
      .replace(/__OS_FRAME_R__/g, String(browserThemeColors.frameR))
      .replace(/__OS_FRAME_G__/g, String(browserThemeColors.frameG))
      .replace(/__OS_FRAME_B__/g, String(browserThemeColors.frameB))
      .replace(/__OS_ACCENT_R__/g, String(browserThemeColors.accentR))
      .replace(/__OS_ACCENT_G__/g, String(browserThemeColors.accentG))
      .replace(/__OS_ACCENT_B__/g, String(browserThemeColors.accentB))
      .replace(/__OS_IS_LIGHT__/g, String(browserThemeColors.isLight))
      .replace(/__SANCTUARY_BRIDGE_TOKEN__/g, bridgeTokenRef.current);
  }, [browserThemeColors]);

  useEffect(() => {
    if (!isSideBrowserOpen || !activeBrowserTabId) return;

    const pollAndInject = () => {
      try {
        const activeLabel = `side-browser-tab-${activeBrowserTabId}`;

        invoke('webview_url', { label: activeLabel })
          .then((url: any) => {
            if (!url || typeof url !== 'string') return;

            const hasFsFlag = url.includes('sanc_fs=true');
            if (hasFsFlag !== (window as any).__last_sanc_fs_flag) {
              (window as any).__last_sanc_fs_flag = hasFsFlag;
              setIsBrowserFullscreen(hasFsFlag);
            }

            if (url.includes('#sanctuary-new-tab=')) {
              const parts = url.split('#sanctuary-new-tab=');
              if (parts.length > 1) {
                const targetUrl = decodeURIComponent(parts[1]);
                openUrlInNewTab(targetUrl);
                invoke('webview_eval', {
                  label: activeLabel,
                  script:
                    "window.history.replaceState(null, '', window.location.pathname + window.location.search);",
                }).catch(console.error);
                return;
              }
            }

            if (url.includes('#sanctuary-action=')) {
              const parts = url.split('#sanctuary-action=');
              if (parts.length > 1) {
                const rawAction = parts[1];
                const expectedPrefix = `${bridgeTokenRef.current}:`;
                if (!rawAction.startsWith(expectedPrefix)) {
                  invoke('webview_eval', {
                    label: activeLabel,
                    script:
                      "window.history.replaceState(null, '', window.location.pathname + window.location.search);",
                  }).catch(console.error);
                  return;
                }
                const action = rawAction.slice(expectedPrefix.length);
                if (action === 'paste') {
                  import('@tauri-apps/plugin-clipboard-manager').then(({ readText }) => {
                    readText().then((clipText) => {
                      if (clipText) {
                        const escaped = JSON.stringify(clipText);
                        invoke('webview_eval', {
                          label: activeLabel,
                          script: `document.execCommand('insertText', false, ${escaped})`,
                        }).catch(console.error);
                      }
                    });
                  });
                } else if (action.startsWith('copyText=')) {
                  const textToCopy = decodeURIComponent(action.substring(9));
                  import('@tauri-apps/plugin-clipboard-manager').then(({ writeText }) => {
                    writeText(textToCopy).catch(console.error);
                  });
                } else if (action.startsWith('stripeCheckoutSuccess=')) {
                  try {
                    const rawPayload = decodeURIComponent(
                      action.substring('stripeCheckoutSuccess='.length)
                    );
                    const parsed = JSON.parse(rawPayload);
                    const sessionId = String(parsed.sessionId || '').trim();
                    const amountUsd = Math.max(5, Number(parsed.amountUsd || 5));
                    if (
                      /^cs_[a-zA-Z0-9_]+$/.test(sessionId) &&
                      /^https:\/\/([a-z0-9-]+\.)*stripe\.com\//i.test(url)
                    ) {
                      setTimeout(() => {
                        import('../utils/supporterManager').then(
                          ({ stackGlobalDevBuildDonation, presentSupporterCelebrationModal }) => {
                            stackGlobalDevBuildDonation({
                              amountUsd,
                              txNonce: `stripe_${sessionId}`,
                            })
                              .then((res) => {
                                window.dispatchEvent(
                                  new CustomEvent('sanctuary-supporter-updated')
                                );
                                presentSupporterCelebrationModal({
                                  devBuildUntil: res.devBuild.dev_build_until,
                                  monthsAdded: res.monthsAdded,
                                  t,
                                });
                                useStore
                                  .getState()
                                  .pushStatus(
                                    t(
                                      'supporter_status_stacked',
                                      'Global Dev Build access updated! +30 days per $5 stacked to your account.'
                                    ),
                                    'success'
                                  );
                              })
                              .catch(() => {
                                window.dispatchEvent(
                                  new CustomEvent('sanctuary-supporter-updated')
                                );
                              });
                          }
                        );
                      }, 950);
                    }
                  } catch (err) {
                    console.error('Failed to process stripeCheckoutSuccess:', err);
                  }
                }
                invoke('webview_eval', {
                  label: activeLabel,
                  script:
                    "window.history.replaceState(null, '', window.location.pathname + window.location.search);",
                }).catch(console.error);
                return;
              }
            }

            const displayUrl = cleanDisplayUrl(url);
            if (displayUrl && displayUrl !== 'about:blank' && displayUrl !== actualUrlRef.current) {
              actualUrlRef.current = displayUrl;
              setActualCurrentUrl(displayUrl);
              if (!isUrlInputFocusedRef.current) {
                setLocalUrlInput(displayUrl);
              }

              setBrowserTabs((prevTabs: any[]) => {
                const idx = prevTabs.findIndex((tab) => tab.id === activeBrowserTabId);
                if (idx !== -1 && prevTabs[idx].url !== displayUrl) {
                  const newTabs = [...prevTabs];
                  newTabs[idx] = {
                    ...newTabs[idx],
                    url: displayUrl,
                    title: formatReadableUrlTitle(displayUrl, newTabs[idx].title),
                  };
                  return newTabs;
                }
                return prevTabs;
              });

              recordHistoryVisit(displayUrl);
            }

            if (displayUrl && displayUrl !== 'about:blank') {
              invoke('webview_eval', {
                label: activeLabel,
                script: buildInjectedScript(),
              }).catch(console.error);
            }
          })
          .catch(() => {});
      } catch {
        // ignore
      }
    };

    pollAndInject();
    const interval = setInterval(pollAndInject, 180);

    return () => clearInterval(interval);
  }, [
    isSideBrowserOpen,
    activeBrowserTabId,
    buildInjectedScript,
    openUrlInNewTab,
    recordHistoryVisit,
    setBrowserTabs,
    t,
  ]);

  useEffect(() => {
    if (isSideBrowserOpen && !hasInitialized) {
      setHasInitialized(true);
      if (browserTabs.length === 0) {
        const initialUrl = ensureValidNavUrl(sideBrowserUrl || 'https://www.google.com');
        const id = Date.now().toString();
        setBrowserTabs([
          { id, url: initialUrl, title: formatReadableUrlTitle(initialUrl), sleeping: false },
        ]);
        setActiveBrowserTabId(id);
        actualUrlRef.current = initialUrl;
        setActualCurrentUrl(initialUrl);
        setLocalUrlInput(initialUrl);
        recordHistoryVisit(initialUrl);
      }
    }
  }, [
    isSideBrowserOpen,
    hasInitialized,
    browserTabs.length,
    sideBrowserUrl,
    setBrowserTabs,
    setActiveBrowserTabId,
    recordHistoryVisit,
  ]);

  // Sync URL state when switching between tabs
  useEffect(() => {
    if (activeBrowserTabId) {
      const activeTab = browserTabs.find((tab) => tab.id === activeBrowserTabId);
      if (activeTab && activeTab.url) {
        actualUrlRef.current = activeTab.url;
        setActualCurrentUrl(activeTab.url);
        if (!isUrlInputFocusedRef.current) {
          setLocalUrlInput(activeTab.url);
        }
      }
    }
  }, [activeBrowserTabId, browserTabs]);

  useEffect(() => {
    if (!isDesktop()) return;
    const unlistenPromise = listen('webview-video-fullscreen', (event: any) => {
      setIsBrowserFullscreen(event.payload === 'true' || event.payload === true);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    if (!hasInitialized) return;

    const appWindow = getCurrentWindow();
    let isUnmounted = false;
    let pendingUpdate = false;
    let isUpdating = false;

    const updateBounds = async () => {
      if (isUnmounted || !containerRef.current) return;
      if (!isSideBrowserOpen) return;

      if (isUpdating) {
        pendingUpdate = true;
        return;
      }
      isUpdating = true;
      try {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const activeLabel = `side-browser-tab-${activeBrowserTabId}`;
          let activeWv = webviewsRef.current.get(activeLabel);
          if (!activeWv) {
            const existing = await Webview.getByLabel(activeLabel).catch(() => null);
            if (existing) {
              webviewsRef.current.set(activeLabel, existing);
              activeWv = existing;
            }
          }
          if (activeWv) {
            if (blockingModalRef.current) {
              await activeWv.setSize(new LogicalSize(1, 1)).catch(console.error);
              await activeWv
                .setPosition(new LogicalPosition(0, window.innerHeight))
                .catch(console.error);
            } else {
              await Promise.all([
                activeWv.setPosition(new LogicalPosition(rect.x, rect.y)),
                activeWv.setSize(new LogicalSize(rect.width, rect.height)),
              ]);
              await activeWv.show().catch(() => {});
            }
          }
        }
      } catch (e) {
        if (!String(e).includes('webview not found')) {
          console.error('Failed to update webview bounds:', e);
        }
      } finally {
        isUpdating = false;
        if (pendingUpdate && !isUnmounted) {
          pendingUpdate = false;
          requestAnimationFrame(updateBounds);
        }
      }
    };

    const syncWebviews = async () => {
      if (isUnmounted) return;

      const activeWebviewsCount = browserTabs.filter((tab) => !tab.sleeping).length;
      if (activeWebviewsCount > maxActiveWebviews) {
        const oldestNonActive = browserTabs.find(
          (tab) => !tab.sleeping && tab.id !== activeBrowserTabId
        );
        if (oldestNonActive) {
          const newTabs = browserTabs.map((tab) =>
            tab.id === oldestNonActive.id ? { ...tab, sleeping: true } : tab
          );
          setBrowserTabs(newTabs);
          return;
        }
      }

      // Adopt any existing Tauri webviews (e.g. after HMR) and close orphaned ones first
      const validOpenLabels = new Set(
        browserTabs.filter((tab) => !tab.sleeping).map((tab) => `side-browser-tab-${tab.id}`)
      );
      const existingWebviews = await getAllWebviews().catch(() => []);
      for (const w of existingWebviews) {
        if (w.label.startsWith('side-browser-tab-')) {
          if (validOpenLabels.has(w.label)) {
            if (!webviewsRef.current.has(w.label)) {
              webviewsRef.current.set(w.label, w);
            }
          } else {
            await w.close().catch(() => {});
            webviewsRef.current.delete(w.label);
          }
        }
      }

      if (isUnmounted) return;

      const container = document.getElementById('side-panel-browser-container');
      const containerRect = container
        ? container.getBoundingClientRect()
        : { x: window.innerWidth, y: window.innerHeight, width: 1, height: 1 };

      for (const tab of browserTabs) {
        const label = `side-browser-tab-${tab.id}`;

        if (tab.sleeping) {
          if (webviewsRef.current.has(label)) {
            webviewsRef.current.get(label)?.close().catch(console.error);
            webviewsRef.current.delete(label);
          }
          continue;
        }

        let wv = webviewsRef.current.get(label);

        const isTabActive =
          isSideBrowserOpen && !blockingModalRef.current && tab.id === activeBrowserTabId;
        const targetX = isTabActive ? containerRect.x : 0;
        const targetY = isTabActive ? containerRect.y : window.innerHeight;

        if (!wv) {
          wv = new Webview(appWindow, label, {
            url: tab.url,
            x: targetX,
            y: targetY,
            width: Math.max(1, containerRect.width),
            height: Math.max(1, containerRect.height),
            transparent: false,
            backgroundColor: wvBgTupleRef.current,
          });
          webviewsRef.current.set(label, wv);
          wv.once('tauri://created', () => {
            const script = buildInjectedScript();
            [0, 50, 110, 200, 340].forEach((delay) => {
              setTimeout(() => {
                invoke('webview_eval', { label, script }).catch(() => {});
              }, delay);
            });
          });
        } else {
          wv.setPosition(new LogicalPosition(targetX, targetY)).catch(console.error);
          if (isTabActive) {
            wv.setSize(
              new LogicalSize(Math.max(1, containerRect.width), Math.max(1, containerRect.height))
            ).catch(console.error);
          } else {
            wv.setSize(new LogicalSize(1, 1)).catch(console.error);
          }
        }

        if (isTabActive) {
          wv.show().catch(() => {});
        } else {
          wv.hide().catch((e) => {
            if (!String(e).includes('not found')) console.error(e);
          });
        }
      }

      const tabLabels = new Set(browserTabs.map((tab) => `side-browser-tab-${tab.id}`));
      for (const [label, wv] of Array.from(webviewsRef.current.entries())) {
        if (!tabLabels.has(label)) {
          wv.close().catch(console.error);
          webviewsRef.current.delete(label);
        }
      }

      setTimeout(updateBounds, 80);
    };

    syncWebviews();
    setTimeout(updateBounds, 80);

    const observer = new ResizeObserver(() => {
      updateBounds();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    const handleWindowResize = () => updateBounds();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      isUnmounted = true;
      observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [
    hasInitialized,
    browserTabs,
    maxActiveWebviews,
    setBrowserTabs,
    activeBrowserTabId,
    isSideBrowserOpen,
  ]);

  useEffect(() => {
    return () => {
      for (const wv of Array.from(webviewsRef.current.values())) {
        wv.close().catch(console.error);
      }
      webviewsRef.current.clear();
    };
  }, []);

  const lastProcessedTriggerRef = useRef(sideBrowserTrigger);

  const handleNavigate = useCallback(
    async (urlToNavigate: string) => {
      const trimmed = (urlToNavigate || '').trim();
      if (!trimmed) return;

      const finalUrl = ensureValidNavUrl(trimmed);

      actualUrlRef.current = finalUrl;
      setActualCurrentUrl(finalUrl);
      setLocalUrlInput(finalUrl);
      recordHistoryVisit(finalUrl);

      // If no tabs exist yet, create and activate one
      if (!activeBrowserTabId || browserTabs.length === 0) {
        const newId = crypto.randomUUID();
        setBrowserTabs([
          { id: newId, url: finalUrl, title: formatReadableUrlTitle(finalUrl), sleeping: false },
        ]);
        setActiveBrowserTabId(newId);
        return;
      }

      const label = `side-browser-tab-${activeBrowserTabId}`;
      const navigateWebview = (retries = 3) => {
        invoke('webview_eval', {
          label,
          script: `window.location.href = ${JSON.stringify(finalUrl)};`,
        })
          .then(() => {
            const script = buildInjectedScript();
            [50, 120, 220, 360].forEach((delay) => {
              setTimeout(() => {
                invoke('webview_eval', { label, script }).catch(() => {});
              }, delay);
            });
          })
          .catch((e) => {
            if (retries > 0) setTimeout(() => navigateWebview(retries - 1), 150);
            else console.error(e);
          });
      };
      navigateWebview();

      setBrowserTabs((prevTabs: any[]) =>
        prevTabs.map((tab) =>
          tab.id === activeBrowserTabId
            ? { ...tab, url: finalUrl, title: formatReadableUrlTitle(finalUrl), sleeping: false }
            : tab
        )
      );

      setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
    },
    [
      activeBrowserTabId,
      browserTabs.length,
      buildInjectedScript,
      recordHistoryVisit,
      setActiveBrowserTabId,
      setBrowserTabs,
    ]
  );

  // External URL open trigger (e.g. handleOpenUrl from anywhere in Sanctuary OS)
  useEffect(() => {
    if (isSideBrowserOpen && hasInitialized && sideBrowserUrl) {
      if (sideBrowserTrigger !== lastProcessedTriggerRef.current) {
        lastProcessedTriggerRef.current = sideBrowserTrigger;
        const finalUrl = ensureValidNavUrl(sideBrowserUrl);
        const activeTab = browserTabs.find((tab) => tab.id === activeBrowserTabId);

        if (!activeBrowserTabId || browserTabs.length === 0) {
          openUrlInNewTab(finalUrl);
        } else if (
          activeTab &&
          normalizeUrlForCompare(activeTab.url) === normalizeUrlForCompare(finalUrl)
        ) {
          const label = `side-browser-tab-${activeBrowserTabId}`;
          invoke('webview_eval', {
            label,
            script: `window.location.href = ${JSON.stringify(finalUrl)};`,
          }).catch(() => {});
          recordHistoryVisit(finalUrl);
        } else {
          openUrlInNewTab(finalUrl);
        }
      }
    }
  }, [
    sideBrowserTrigger,
    sideBrowserUrl,
    hasInitialized,
    isSideBrowserOpen,
    activeBrowserTabId,
    browserTabs,
    openUrlInNewTab,
    recordHistoryVisit,
  ]);

  const createNewTab = () => {
    openUrlInNewTab('https://www.google.com');
  };

  const closeTab = (e: React.MouseEvent, idToClose: string) => {
    e.stopPropagation();
    const newTabs = browserTabs.filter((tab) => tab.id !== idToClose);
    if (newTabs.length === 0) {
      setIsSideBrowserOpen(false);
      setBrowserTabs([]);
      setActiveBrowserTabId(null);
    } else if (activeBrowserTabId === idToClose) {
      const idx = browserTabs.findIndex((tab) => tab.id === idToClose);
      const prevTab = newTabs[Math.max(0, idx - 1)];
      setActiveBrowserTabId(prevTab.id);
      const wokenTabs = newTabs.map((tab) =>
        tab.id === prevTab.id ? { ...tab, sleeping: false } : tab
      );
      setBrowserTabs(wokenTabs);
    } else {
      setBrowserTabs(newTabs);
    }
  };

  const activeTabObj = useMemo(
    () => browserTabs.find((tab) => tab.id === activeBrowserTabId) || null,
    [browserTabs, activeBrowserTabId]
  );

  const currentActiveUrl = useMemo(() => {
    const candidate = actualCurrentUrl || activeTabObj?.url || localUrlInput || '';
    return cleanDisplayUrl(candidate);
  }, [actualCurrentUrl, activeTabObj, localUrlInput]);

  const safeBookmarks = useMemo(() => {
    if (!Array.isArray(browserBookmarks)) return [];
    return browserBookmarks.filter((b) => b && typeof b.url === 'string' && b.url.trim().length > 0);
  }, [browserBookmarks]);

  const safeHistory = useMemo(() => {
    if (!Array.isArray(browserHistory)) return [];
    return browserHistory.filter(
      (h) =>
        h &&
        typeof h.url === 'string' &&
        h.url.trim().length > 0 &&
        h.url !== 'about:blank'
    );
  }, [browserHistory]);

  const isCurrentUrlBookmarked = useMemo(() => {
    if (!currentActiveUrl || currentActiveUrl === 'about:blank') return false;
    const normCurrent = normalizeUrlForCompare(currentActiveUrl);
    return safeBookmarks.some((b) => normalizeUrlForCompare(b.url) === normCurrent);
  }, [currentActiveUrl, safeBookmarks]);

  const toggleBookmark = useCallback(() => {
    const urlToBookmark = cleanDisplayUrl(
      actualCurrentUrl || activeTabObj?.url || localUrlInput
    );
    if (!urlToBookmark || urlToBookmark === 'about:blank') return;

    const normTarget = normalizeUrlForCompare(urlToBookmark);
    const existsAlready = safeBookmarks.some(
      (b) => normalizeUrlForCompare(b.url) === normTarget
    );

    if (existsAlready) {
      setBrowserBookmarks(
        safeBookmarks.filter((b) => normalizeUrlForCompare(b.url) !== normTarget)
      );
    } else {
      const readableTitle = formatReadableUrlTitle(urlToBookmark, activeTabObj?.title);
      setBrowserBookmarks([{ url: urlToBookmark, title: readableTitle }, ...safeBookmarks]);
    }
  }, [actualCurrentUrl, activeTabObj, localUrlInput, safeBookmarks, setBrowserBookmarks]);

  const filteredBookmarks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return safeBookmarks;
    return safeBookmarks.filter((b) => {
      const titleStr = String(b.title || '').toLowerCase();
      const urlStr = String(b.url || '').toLowerCase();
      return titleStr.includes(q) || urlStr.includes(q);
    });
  }, [safeBookmarks, searchQuery]);

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return safeHistory;
    return safeHistory.filter((h) => {
      const titleStr = String(h.title || '').toLowerCase();
      const urlStr = String(h.url || '').toLowerCase();
      return titleStr.includes(q) || urlStr.includes(q);
    });
  }, [safeHistory, searchQuery]);

  const groupedHistory = useMemo(() => {
    const groups: Record<string, typeof safeHistory> = {};
    filteredHistory.forEach((h) => {
      const ts = typeof h.timestamp === 'number' && !isNaN(h.timestamp) ? h.timestamp : Date.now();
      const dateLabel = new Date(ts).toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      if (!groups[dateLabel]) groups[dateLabel] = [];
      groups[dateLabel].push(h);
    });
    return groups;
  }, [filteredHistory]);

  if (!hasInitialized) return null;

  const isSecureUrl = /^https:\/\//i.test(currentActiveUrl || localUrlInput);

  return (
    <div
      style={{ display: isSideBrowserOpen ? 'block' : 'none' }}
      className={
        isBlockingModalOpen
          ? 'opacity-0 pointer-events-none transition-opacity duration-300'
          : 'opacity-100 transition-opacity duration-300'
      }
    >
      <SidePanel
        isOpen={isSideBrowserOpen}
        keepMounted={true}
        onClose={() => setIsSideBrowserOpen(false)}
        backdropZ="z-[999999]"
        panelZ="z-[1000000]"
        hideHeader={true}
        noPadding={true}
        noScroll={true}
        isResizable={!isBrowserFullscreen}
        defaultWidth={Math.max(680, Math.round(window.innerWidth * 0.52))}
        panelClass={
          isBrowserFullscreen
            ? '!top-[0px] !inset-x-0 !bottom-0 !border-0 !rounded-none'
            : '!top-[0px] !bottom-0 !border-y-0 !border-r-0'
        }
        panelStyle={isBrowserFullscreen ? { width: '100vw', right: 0 } : { right: 0 }}
      >
        {/* Liquid Glass Browser Chrome Header */}
        <div className="px-4 pt-4 pb-3 sm:px-5 sm:pt-5 sm:pb-3.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] shrink-0 relative z-30 flex flex-col gap-3">
          {/* Row 1: Navigation Controls, Omnibox & Window Actions */}
          <div className="flex items-center gap-2.5 w-full">
            {/* Back / Forward / Refresh Cluster */}
            <div className="glass-surface rounded-2xl p-1 flex items-center gap-0.5 shrink-0">
              <PanelHeaderButton
                icon={t('icon_arrow_back', 'arrow_back')}
                tooltip={t('nav_prev', 'Back')}
                onClick={() => {
                  const label = `side-browser-tab-${activeBrowserTabId}`;
                  invoke('webview_eval', { label, script: 'window.history.back()' }).catch(
                    console.error
                  );
                }}
              />
              <PanelHeaderButton
                icon={t('icon_arrow_forward', 'arrow_forward')}
                tooltip={t('nav_next', 'Forward')}
                onClick={() => {
                  const label = `side-browser-tab-${activeBrowserTabId}`;
                  invoke('webview_eval', { label, script: 'window.history.forward()' }).catch(
                    console.error
                  );
                }}
              />
              <PanelHeaderButton
                icon={t('icon_refresh', 'refresh')}
                tooltip={t('btn_refresh', 'Refresh')}
                onClick={() => {
                  const label = `side-browser-tab-${activeBrowserTabId}`;
                  invoke('webview_eval', { label, script: 'window.location.reload()' }).catch(
                    console.error
                  );
                }}
              />
            </div>

            {/* Liquid Glass Omnibox / URL Bar */}
            <div className="glass-surface rounded-2xl px-3.5 h-11 flex-1 min-w-0 flex items-center gap-2.5 focus-within:!border-[color-mix(in_srgb,var(--text)_28%,transparent)] transition-all relative">
              <span
                className={`material-symbols-outlined !text-[17px] shrink-0 ${
                  isSecureUrl ? 'text-[var(--accent)] opacity-85' : 'text-[var(--subtext)]'
                }`}
              >
                {isSecureUrl ? t('icon_lock', 'lock') : t('icon_public', 'public')}
              </span>

              <input
                type="text"
                value={localUrlInput}
                onFocus={() => {
                  isUrlInputFocusedRef.current = true;
                }}
                onBlur={() => {
                  isUrlInputFocusedRef.current = false;
                }}
                onChange={(e) => setLocalUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                    handleNavigate(localUrlInput);
                  }
                }}
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-xs sm:text-sm text-[var(--text)] font-medium placeholder-[var(--subtext)]/70"
                placeholder={t('browser_url', 'URL')}
              />

              {localUrlInput && (
                <button
                  type="button"
                  onClick={() => setLocalUrlInput('')}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-[var(--subtext)] opacity-50 hover:opacity-100 hover:text-[var(--text)] transition-opacity shrink-0"
                >
                  <span className="material-symbols-outlined !text-[15px]">
                    {t('icon_close', 'close')}
                  </span>
                </button>
              )}

              <div className="w-px h-5 bg-[color-mix(in_srgb,var(--text)_12%,transparent)] shrink-0" />

              {/* Bookmark Star Toggle inside Omnibox */}
              <div className="relative group/starbtn shrink-0">
                <button
                  type="button"
                  onClick={toggleBookmark}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 ${
                    isCurrentUrlBookmarked
                      ? 'text-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)]'
                      : 'text-[var(--subtext)] hover:text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]'
                  }`}
                >
                  <span
                    className="material-symbols-outlined !text-[19px]"
                    style={{
                      fontVariationSettings: isCurrentUrlBookmarked ? "'FILL' 1" : "'FILL' 0",
                    }}
                  >
                    {t('icon_star', 'star')}
                  </span>
                </button>
                <HoverTooltip
                  title={
                    isCurrentUrlBookmarked
                      ? t('browser_bookmarked', 'Bookmarked')
                      : t('browser_bookmark_current', 'Bookmark Current Page')
                  }
                  vAlign="bottom"
                />
              </div>
            </div>

            {/* Right Action & Window Control Cluster (Matches SidePanel Header Standard) */}
            <div className="glass-surface rounded-2xl p-1 flex items-center gap-1 shrink-0">
              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t('icon_open_in_new', 'open_in_new')}
                  tooltip={t('browser_open_external', 'Open External')}
                  onClick={() => {
                    invoke('webview_url', { label: `side-browser-tab-${activeBrowserTabId}` })
                      .then((url) => {
                        import('@tauri-apps/plugin-opener').then((m) =>
                          m.openUrl((url as string) || currentActiveUrl)
                        );
                      })
                      .catch(() => {
                        import('@tauri-apps/plugin-opener').then((m) =>
                          m.openUrl(currentActiveUrl || localUrlInput)
                        );
                      });
                  }}
                />
                <PanelHeaderButton
                  icon={
                    isBookmarksDropdownOpen
                      ? t('icon_menu_open', 'menu_open')
                      : t('icon_bookmarks', 'bookmarks')
                  }
                  isActive={isBookmarksDropdownOpen}
                  tooltip={`${t('browser_bookmarks', 'Bookmarks')} & ${t(
                    'browser_history',
                    'History'
                  )}`}
                  onClick={() => setIsBookmarksDropdownOpen((prev) => !prev)}
                />
                <PanelHeaderButton
                  icon={
                    isBrowserFullscreen
                      ? t('icon_fullscreen_exit', 'fullscreen_exit')
                      : t('icon_fullscreen', 'fullscreen')
                  }
                  isActive={isBrowserFullscreen}
                  tooltip={
                    isBrowserFullscreen
                      ? t('btn_exit_fullscreen', 'Exit Fullscreen')
                      : t('btn_fullscreen', 'Fullscreen')
                  }
                  onClick={() => setIsBrowserFullscreen((prev) => !prev)}
                />
              </PanelHeaderGroup>

              <div className="w-px h-5 bg-[color-mix(in_srgb,var(--text)_15%,transparent)] mx-0.5" />

              <PanelHeaderGroup>
                <PanelHeaderButton
                  icon={t('icon_close', 'close')}
                  tooltip={t('btn_close', 'Close')}
                  variant="danger"
                  onClick={() => setIsSideBrowserOpen(false)}
                />
              </PanelHeaderGroup>
            </div>
          </div>

          {/* Row 2: Smoked Frosted Tab Strip (Matches Sidebar Active State — Zero Neon Outline) */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
            {browserTabs.map((tab) => {
              const isActive = tab.id === activeBrowserTabId;
              const tabTitle = formatReadableUrlTitle(tab.url, tab.title);
              return (
                <div
                  key={tab.id}
                  onClick={() => {
                    setActiveBrowserTabId(tab.id);
                    if (tab.sleeping) {
                      setBrowserTabs((prev) =>
                        prev.map((item) =>
                          item.id === tab.id ? { ...item, sleeping: false } : item
                        )
                      );
                    }
                  }}
                  onAuxClick={(e) => {
                    if (e.button === 1) closeTab(e as any, tab.id);
                  }}
                  className={`group h-9 pl-3 pr-2 rounded-xl flex items-center gap-2 shrink-0 cursor-pointer transition-all select-none ${
                    isActive
                      ? 'sa-glass-active text-[var(--text)]'
                      : 'bg-[color-mix(in_srgb,var(--text)_4%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] opacity-70 hover:opacity-100'
                  } ${tab.sleeping ? 'opacity-50' : ''}`}
                >
                  <span
                    className={`material-symbols-outlined !text-[15px] shrink-0 transition-colors ${
                      isActive
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)]'
                    }`}
                  >
                    {tab.sleeping
                      ? t('icon_bedtime', 'bedtime')
                      : t('icon_language', 'language')}
                  </span>

                  <span className="max-w-[160px] truncate text-[11px] font-bold tracking-tight">
                    {tabTitle}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => closeTab(e, tab.id)}
                    className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 transition-all hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:text-[var(--danger)] ${
                      isActive ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[13px]">
                      {t('icon_close', 'close')}
                    </span>
                  </button>
                </div>
              );
            })}

            <button
              type="button"
              onClick={createNewTab}
              title={t('browser_new_tab', 'New Tab')}
              className="w-9 h-9 rounded-xl bg-[color-mix(in_srgb,var(--text)_4%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_9%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center justify-center shrink-0 text-[var(--subtext)] hover:text-[var(--text)] active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined !text-[18px]">
                {t('icon_add', 'add')}
              </span>
            </button>
          </div>
        </div>

        {/* Main Workspace: Webview Viewport & Bookmarks / History Drawer */}
        <div className="flex-1 w-full min-h-0 flex flex-row gap-3 px-4 py-3 sm:px-5 sm:py-4 relative overflow-hidden">
          {/* Concentric 6px Recessed Webview Bezel (Guarantees 90° HWND corners stay inside the 17px curve with zero corner bleed) */}
          <div
            className="flex-1 h-full min-w-0 rounded-[17px] p-[6px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_28px_rgba(0,0,0,0.32)] flex flex-col relative overflow-hidden"
            style={{ backgroundColor: browserThemeColors.frameCss }}
          >
            <div
              id="side-panel-browser-container"
              ref={containerRef}
              className="flex-1 w-full h-full rounded-[11px] overflow-hidden relative"
              style={{ backgroundColor: browserThemeColors.bgCss }}
            >
              {browserTabs.length === 0 && (
                <div className="absolute inset-0 rounded-[inherit] flex flex-col items-center justify-center z-50 pointer-events-auto p-6">
                  <EmptyState
                    icon={t('icon_public', 'public')}
                    title={t('browser_ready_to_browse', 'Ready to Browse')}
                    subtitle={t(
                      'browser_ready_to_browse_desc',
                      'Open a new tab or enter a URL above to start browsing.'
                    )}
                    action={
                      <ActionButton
                        variant="accent"
                        icon={t('icon_add', 'add')}
                        label={t('browser_new_tab', 'New Tab')}
                        onClick={createNewTab}
                      />
                    }
                  />
                </div>
              )}
            </div>
          </div>

          {/* Bookmarks & Recent (Trace Logs) Side Drawer */}
          {isBookmarksDropdownOpen && (
            <div className="w-80 sm:w-[360px] shrink-0 h-full glass-panel rounded-2xl flex flex-col overflow-hidden relative z-40 pointer-events-auto">
              {/* Drawer Header: Smoked Mode Switcher & Search Bar */}
              <div className="p-3.5 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col gap-3 shrink-0">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDrawerTab('bookmarks')}
                    className={`rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 transition-all cursor-pointer ${
                      drawerTab === 'bookmarks'
                        ? 'sa-glass-active text-[var(--text)]'
                        : 'bg-[color-mix(in_srgb,var(--text)_4%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] opacity-75 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`material-symbols-outlined !text-[17px] shrink-0 ${
                          drawerTab === 'bookmarks' ? 'text-[var(--accent)]' : 'text-[var(--subtext)]'
                        }`}
                      >
                        {t('icon_bookmarks', 'bookmarks')}
                      </span>
                      <span className="text-[11px] font-bold tracking-tight truncate">
                        {t('browser_bookmarks', 'Bookmarks')}
                      </span>
                    </div>
                    <span className="bg-transparent border border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--subtext)] px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0">
                      {safeBookmarks.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDrawerTab('history')}
                    className={`rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 transition-all cursor-pointer ${
                      drawerTab === 'history'
                        ? 'sa-glass-active text-[var(--text)]'
                        : 'bg-[color-mix(in_srgb,var(--text)_4%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] opacity-75 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`material-symbols-outlined !text-[17px] shrink-0 ${
                          drawerTab === 'history' ? 'text-[var(--accent)]' : 'text-[var(--subtext)]'
                        }`}
                      >
                        {t('icon_history', 'history')}
                      </span>
                      <span className="text-[11px] font-bold tracking-tight truncate">
                        {t('browser_history', 'History')}
                      </span>
                    </div>
                    <span className="bg-transparent border border-[color-mix(in_srgb,var(--text)_18%,transparent)] text-[var(--subtext)] px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0">
                      {safeHistory.length}
                    </span>
                  </button>
                </div>

                {/* Search + Quick Context Action */}
                <div className="flex items-center gap-2">
                  <div className="glass-surface rounded-xl px-3 h-10 flex-1 min-w-0 flex items-center gap-2 focus-within:!border-[color-mix(in_srgb,var(--text)_28%,transparent)] transition-all">
                    <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] shrink-0">
                      {t('icon_search', 'search')}
                    </span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={
                        drawerTab === 'bookmarks'
                          ? t('browser_search_bookmarks', 'Search bookmarks...')
                          : t('browser_search_history', 'Search history...')
                      }
                      className="flex-1 min-w-0 bg-transparent border-none outline-none text-xs text-[var(--text)] placeholder-[var(--subtext)]/70"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center"
                      >
                        <span className="material-symbols-outlined !text-[14px]">
                          {t('icon_close', 'close')}
                        </span>
                      </button>
                    )}
                  </div>

                  <div className="glass-surface rounded-xl p-0.5 shrink-0">
                    {drawerTab === 'bookmarks' ? (
                      <PanelHeaderButton
                        icon={
                          isCurrentUrlBookmarked
                            ? t('icon_bookmark_remove', 'bookmark_remove')
                            : t('icon_bookmark_add', 'bookmark_add')
                        }
                        variant={isCurrentUrlBookmarked ? 'warning' : 'default'}
                        isActive={isCurrentUrlBookmarked}
                        tooltip={
                          isCurrentUrlBookmarked
                            ? t('btn_remove', 'Remove')
                            : t('browser_bookmark_current', 'Bookmark Current Page')
                        }
                        tooltipAlign="right"
                        onClick={toggleBookmark}
                      />
                    ) : (
                      <PanelHeaderButton
                        icon={t('icon_delete_sweep', 'delete_sweep')}
                        variant="danger"
                        disabled={safeHistory.length === 0}
                        tooltip={t('nav_clear_all', 'Clear All')}
                        tooltipAlign="right"
                        onClick={() => setBrowserHistory([])}
                      />
                    )}
                  </div>
                </div>

                {/* Quick Bookmark Current Page Action Pill in Bookmarks Tab */}
                {drawerTab === 'bookmarks' &&
                  currentActiveUrl &&
                  currentActiveUrl !== 'about:blank' && (
                    <button
                      type="button"
                      onClick={toggleBookmark}
                      className={`w-full rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-left transition-all cursor-pointer ${
                        isCurrentUrlBookmarked
                          ? 'sa-glass-active text-[var(--text)]'
                          : 'bg-[color-mix(in_srgb,var(--text)_4%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className={`material-symbols-outlined !text-[16px] shrink-0 ${
                            isCurrentUrlBookmarked
                              ? 'text-[var(--warning)]'
                              : 'text-[var(--accent)]'
                          }`}
                          style={{
                            fontVariationSettings: isCurrentUrlBookmarked ? "'FILL' 1" : "'FILL' 0",
                          }}
                        >
                          {isCurrentUrlBookmarked
                            ? t('icon_bookmark_added', 'bookmark_added')
                            : t('icon_bookmark_add', 'bookmark_add')}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider truncate">
                          {isCurrentUrlBookmarked
                            ? t('browser_bookmarked', 'Bookmarked')
                            : t('browser_bookmark_current', 'Bookmark Current Page')}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-[var(--subtext)] truncate max-w-[110px] opacity-75">
                        {formatReadableUrlTitle(currentActiveUrl)}
                      </span>
                    </button>
                  )}
              </div>

              {/* Drawer Scrollable List */}
              <div className="overflow-y-auto custom-scrollbar flex-1 min-h-0 p-3 flex flex-col gap-2.5">
                {drawerTab === 'bookmarks' ? (
                  filteredBookmarks.length === 0 ? (
                    <EmptyState
                      icon={t('icon_bookmark', 'bookmark')}
                      title={t('browser_no_bookmarks', 'No bookmarks yet')}
                      minHeightClass="min-h-[220px]"
                    />
                  ) : (
                    filteredBookmarks.map((b, index) => {
                      const isEditing = editingBookmarkUrl === b.url;
                      const isActiveBookmark =
                        normalizeUrlForCompare(b.url) ===
                        normalizeUrlForCompare(currentActiveUrl);
                      return (
                        <div
                          key={`${b.url}-${index}`}
                          onClick={() => {
                            if (!isEditing) {
                              handleNavigate(b.url);
                            }
                          }}
                          onAuxClick={(e) => {
                            if (e.button === 1 && !isEditing) {
                              openUrlInNewTab(b.url);
                            }
                          }}
                          className={`p-3 text-left rounded-2xl transition-all flex flex-col gap-2 group cursor-pointer ${
                            isActiveBookmark
                              ? 'sa-glass-active text-[var(--text)]'
                              : 'glass-surface hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)]'
                          }`}
                        >
                          {isEditing ? (
                            <div
                              className="flex flex-col gap-2.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="glass-surface rounded-xl px-3 py-2 text-xs font-bold text-[var(--text)] outline-none focus:!border-[color-mix(in_srgb,var(--text)_35%,transparent)]"
                                placeholder={t('browser_bookmark_title', 'Bookmark Title')}
                              />
                              <input
                                type="text"
                                value={editUrl}
                                onChange={(e) => setEditUrl(e.target.value)}
                                className="glass-surface rounded-xl px-3 py-2 text-[11px] font-mono text-[var(--subtext)] outline-none focus:!border-[color-mix(in_srgb,var(--text)_35%,transparent)]"
                                placeholder={t('browser_url', 'URL')}
                              />
                              <div className="flex justify-end gap-2 mt-0.5">
                                <button
                                  type="button"
                                  onClick={() => setEditingBookmarkUrl(null)}
                                  className="glass-surface px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] transition-colors"
                                >
                                  {t('cancel', 'Cancel')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updatedUrl = ensureValidNavUrl(editUrl || b.url);
                                    const updatedTitle =
                                      editTitle.trim() || formatReadableUrlTitle(updatedUrl);
                                    setBrowserBookmarks(
                                      safeBookmarks.map((bm) =>
                                        bm.url === b.url
                                          ? { ...bm, title: updatedTitle, url: updatedUrl }
                                          : bm
                                      )
                                    );
                                    setEditingBookmarkUrl(null);
                                  }}
                                  className="sa-glass-active px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-[var(--text)] transition-all"
                                >
                                  {t('hub_save', 'Save')}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2.5 w-full min-w-0">
                              <div className="w-8 h-8 rounded-xl border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] flex items-center justify-center shrink-0 text-[var(--accent)]">
                                <span
                                  className="material-symbols-outlined !text-[16px]"
                                  style={{
                                    fontVariationSettings: isActiveBookmark
                                      ? "'FILL' 1"
                                      : "'FILL' 0",
                                  }}
                                >
                                  {t('icon_bookmark', 'bookmark')}
                                </span>
                              </div>

                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-xs font-bold truncate text-[var(--text)] transition-colors">
                                  {formatReadableUrlTitle(b.url, b.title)}
                                </span>
                                <span className="text-[10px] font-mono truncate text-[var(--subtext)] opacity-75">
                                  {b.url}
                                </span>
                              </div>

                              <div className="flex items-center gap-0.5 shrink-0 opacity-75 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  title={t('browser_new_tab', 'New Tab')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openUrlInNewTab(b.url);
                                  }}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-colors"
                                >
                                  <span className="material-symbols-outlined !text-[15px]">
                                    {t('icon_open_in_new', 'open_in_new')}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  title={t('edit', 'Edit')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingBookmarkUrl(b.url);
                                    setEditTitle(formatReadableUrlTitle(b.url, b.title));
                                    setEditUrl(b.url);
                                  }}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-colors"
                                >
                                  <span className="material-symbols-outlined !text-[15px]">
                                    {t('icon_edit', 'edit')}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  title={t('btn_delete', 'Delete')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBrowserBookmarks(
                                      safeBookmarks.filter((bm) => bm.url !== b.url)
                                    );
                                  }}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] transition-colors"
                                >
                                  <span className="material-symbols-outlined !text-[15px]">
                                    {t('icon_delete', 'delete')}
                                  </span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )
                ) : filteredHistory.length === 0 ? (
                  <EmptyState
                    icon={t('icon_history', 'history')}
                    title={t('browser_no_history', 'No history yet')}
                    minHeightClass="min-h-[220px]"
                  />
                ) : (
                  Object.entries(groupedHistory).map(([date, items]) => {
                    // Default to expanded so recent history is immediately visible
                    const isExpanded = expandedHistoryDays[date] !== false;
                    return (
                      <div key={date} className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedHistoryDays((prev) => ({
                              ...prev,
                              [date]: !isExpanded,
                            }))
                          }
                          className="glass-surface rounded-xl px-3 py-2 flex items-center justify-between gap-2 cursor-pointer group w-full text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                              {t('icon_calendar_today', 'calendar_today')}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text)] truncate">
                              {date}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="bg-transparent border border-[color-mix(in_srgb,var(--text)_20%,transparent)] text-[var(--subtext)] px-2 py-0.5 rounded-lg text-[9px] font-black">
                              {items.length}
                            </span>
                            <span
                              className="material-symbols-outlined !text-[15px] text-[var(--subtext)] group-hover:text-[var(--text)] transition-transform duration-200"
                              style={{ transform: !isExpanded ? 'rotate(-90deg)' : 'none' }}
                            >
                              {t('icon_expand_more', 'expand_more')}
                            </span>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="flex flex-col gap-2">
                            {items.map((h, index) => {
                              const readableTitle = formatReadableUrlTitle(h.url, h.title);
                              const timeStr =
                                typeof h.timestamp === 'number' && !isNaN(h.timestamp)
                                  ? new Date(h.timestamp).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '';
                              return (
                                <div
                                  key={`${h.timestamp}-${index}`}
                                  onClick={() => handleNavigate(h.url)}
                                  onAuxClick={(e) => {
                                    if (e.button === 1) {
                                      openUrlInNewTab(h.url);
                                    }
                                  }}
                                  className="p-3 text-left rounded-2xl glass-surface hover:!border-[color-mix(in_srgb,var(--text)_24%,transparent)] transition-all flex items-center justify-between gap-2.5 group cursor-pointer"
                                >
                                  <div className="w-8 h-8 rounded-xl border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] flex items-center justify-center shrink-0 text-[var(--subtext)] group-hover:text-[var(--accent)] transition-colors">
                                    <span className="material-symbols-outlined !text-[16px]">
                                      {t('icon_public', 'public')}
                                    </span>
                                  </div>

                                  <div className="flex flex-col min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-bold truncate text-[var(--text)] transition-colors">
                                        {readableTitle}
                                      </span>
                                      {timeStr && (
                                        <span className="text-[9px] font-mono text-[var(--subtext)] opacity-60 shrink-0">
                                          {timeStr}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] font-mono truncate text-[var(--subtext)] opacity-75">
                                      {h.url}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-0.5 shrink-0 opacity-75 group-hover:opacity-100 transition-opacity">
                                    <button
                                      type="button"
                                      title={t('browser_new_tab', 'New Tab')}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openUrlInNewTab(h.url);
                                      }}
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-colors"
                                    >
                                      <span className="material-symbols-outlined !text-[15px]">
                                        {t('icon_open_in_new', 'open_in_new')}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      title={t('btn_delete', 'Delete')}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setBrowserHistory(
                                          safeHistory.filter(
                                            (bm) => bm.timestamp !== h.timestamp
                                          )
                                        );
                                      }}
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] transition-colors"
                                    >
                                      <span className="material-symbols-outlined !text-[15px]">
                                        {t('icon_delete', 'delete')}
                                      </span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <SidePanelBrowserDownloads
          downloadsQueue={downloadsQueue}
          setDownloadsQueue={setDownloadsQueue}
        />
      </SidePanel>
    </div>
  );
}
