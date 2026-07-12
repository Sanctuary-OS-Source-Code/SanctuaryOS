import React, { useEffect, useState, useRef } from 'react';
import { Webview, getAllWebviews } from '@tauri-apps/api/webview';
import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createPortal } from 'react-dom';
import { useModalStore } from '../store/modalStore';
import { useLexicon } from '../LexiconContext';
import { useStore } from '../store';
import { useTheme } from '../ThemeContext';
import { INJECTED_BROWSER_SCRIPT } from './browserInjection';

export default function SidePanelBrowser() {
  const { t } = useLexicon();
  const { currentTheme } = useTheme();
  const { activeGameSchema } = useStore();
  const {
    isSideBrowserOpen, setIsSideBrowserOpen,
    sideBrowserUrl, setSideBrowserUrl,
    browserTabs, setBrowserTabs,
    activeBrowserTabId, setActiveBrowserTabId,
    browserBookmarks, setBrowserBookmarks,
    browserHistory, setBrowserHistory,
    maxActiveWebviews,
    downloadsQueue, setDownloadsQueue,
    dnaMatchQueue, confirmDialog, showQuarantineModal, showBrokenModal, isUpdatePanelOpen,
    snapshotModal, bulkModal, renameModal, localFolderModal, yeetConfirmPending, scoutQueue,
    isBackingUp, isRestoring, showDefconAlert
  } = useModalStore();

  const isBlockingModalOpen = dnaMatchQueue.length > 0 || !!confirmDialog || showQuarantineModal || showBrokenModal ||
    snapshotModal || bulkModal || !!renameModal || localFolderModal || !!yeetConfirmPending || scoutQueue.length > 0 ||
    isBackingUp || isRestoring || showDefconAlert;

  const blockingModalRef = useRef(isBlockingModalOpen);

  useEffect(() => {
    blockingModalRef.current = isBlockingModalOpen;
    window.dispatchEvent(new Event('resize'));
  }, [isBlockingModalOpen]);

  const [panelWidth, setPanelWidth] = useState(window.innerWidth / 2);
  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);
  const [localUrlInput, setLocalUrlInput] = useState('');

  const webviewsRef = useRef<Map<string, Webview>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!isSideBrowserOpen || !activeBrowserTabId) return;

    const interval = setInterval(async () => {
      try {
        const activeLabel = `side-browser-tab-${activeBrowserTabId}`;
        const activeWv = webviewsRef.current.get(activeLabel);

        if (activeWv) {
          invoke('webview_url', { label: activeLabel }).then((url: any) => {
            if (!url) return;

            const hasFsFlag = url.includes('sanc_fs=true');
            if (hasFsFlag !== (window as any).__last_sanc_fs_flag) {
              (window as any).__last_sanc_fs_flag = hasFsFlag;
              setIsBrowserFullscreen(hasFsFlag);
            }

            if (url.includes('#sanctuary-new-tab=')) {
              const parts = url.split('#sanctuary-new-tab=');
              if (parts.length > 1) {
                const targetUrl = decodeURIComponent(parts[1]);
                let validUrl = targetUrl.trim();
                if (!validUrl) validUrl = 'https://google.com';
                else if (!/^https?:\/\//i.test(validUrl)) validUrl = 'https://' + validUrl.replace(/^\/+/, '');
                const newId = crypto.randomUUID();
                setBrowserTabs((prev: any) => [...prev, { id: newId, url: validUrl, sleeping: false }]);
                setActiveBrowserTabId(newId);
                invoke('webview_eval', { label: activeLabel, script: "window.history.replaceState(null, '', window.location.pathname + window.location.search);" }).catch(console.error);
                return;
              }
            }

            if (url.includes('#sanctuary-action=')) {
              const parts = url.split('#sanctuary-action=');
              if (parts.length > 1) {
                const action = parts[1];
                if (action === 'paste') {
                  import("@tauri-apps/plugin-clipboard-manager").then(({ readText }) => {
                    readText().then((clipText) => {
                      if (clipText) {
                        const escaped = clipText.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\\n/g, '\\\\n').replace(/\\r/g, '');
                        invoke('webview_eval', { label: activeLabel, script: `document.execCommand('insertText', false, '${escaped}')` }).catch(console.error);
                      }
                    });
                  });
                } else if (action.startsWith('copyText=')) {
                  const textToCopy = decodeURIComponent(action.substring(9));
                  import("@tauri-apps/plugin-clipboard-manager").then(({ writeText }) => {
                    writeText(textToCopy).catch(console.error);
                  });
                }
                invoke('webview_eval', { label: activeLabel, script: "window.history.replaceState(null, '', window.location.pathname + window.location.search);" }).catch(console.error);
                return;
              }
            }

            const displayUrl = url.replace(/([?&])sanc_fs=(true|false)&?/, '$1').replace(/[?&]$/, '');
            if (displayUrl !== actualUrlRef.current) {
              actualUrlRef.current = displayUrl;
              setActualCurrentUrl(displayUrl);

              setBrowserTabs((prevTabs: any[]) => {
                const idx = prevTabs.findIndex(t => t.id === activeBrowserTabId);
                if (idx !== -1 && prevTabs[idx].url !== displayUrl && !prevTabs[idx].url.includes(displayUrl.split('?')[0])) {
                  const newTabs = [...prevTabs];
                  newTabs[idx] = { ...newTabs[idx], url: displayUrl };
                  return newTabs;
                }
                return prevTabs;
              });

              useModalStore.getState().setBrowserHistory((prev: any) => {
                if (prev.length > 0 && prev[0].url === displayUrl) return prev;
                return [{ url: displayUrl, title: displayUrl, timestamp: Date.now() }, ...prev].slice(0, 100);
              });
            }

            if (displayUrl !== 'about:blank') {
              const osBgColor = currentTheme.bg || '#000000';
              const script = INJECTED_BROWSER_SCRIPT.replace(/__OS_BG_COLOR__/g, osBgColor);
              invoke('webview_eval', { label: activeLabel, script }).catch(console.error);
            }
          }).catch(() => { });
        }
      } catch (e) {
        // ignore
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isSideBrowserOpen, activeBrowserTabId]);

  useEffect(() => {
    setIsBookmarksDropdownOpen(false);
  }, [isSideBrowserOpen, sideBrowserUrl]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      setPanelWidth(Math.max(400, Math.min(newWidth, window.innerWidth - 100)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      isResizingRef.current = false;
      window.dispatchEvent(new Event('resize'));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    if (isSideBrowserOpen && !hasInitialized) {
      setHasInitialized(true);
      if (browserTabs.length === 0) {
        const id = Date.now().toString();
        setBrowserTabs([{ id, url: sideBrowserUrl || 'https://google.com', sleeping: false }]);
        setActiveBrowserTabId(id);
      }
    }
  }, [isSideBrowserOpen, hasInitialized, browserTabs.length, sideBrowserUrl, setBrowserTabs, setActiveBrowserTabId]);

  useEffect(() => {
    if (activeBrowserTabId) {
      const activeTab = browserTabs.find(t => t.id === activeBrowserTabId);
      if (activeTab) {
        setLocalUrlInput(activeTab.url);
      }
    }
  }, [activeBrowserTabId, browserTabs]);

  useEffect(() => {
    const unlistenPromise = listen('webview-video-fullscreen', (event: any) => {
      setIsBrowserFullscreen(event.payload === "true" || event.payload === true);
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  useEffect(() => {
    if (!hasInitialized) return;

    const appWindow = getCurrentWindow();
    let isUnmounted = false;
    let pendingUpdate = false;
    let isUpdating = false;

    getAllWebviews().then(webviews => {
      for (const w of webviews) {
        if (w.label.startsWith('side-browser-tab-') && !webviewsRef.current.has(w.label)) {
          w.close().catch(e => { if (!String(e).includes("not found")) console.error(e) });
        }
      }
    }).catch(console.error);

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
          const activeWv = webviewsRef.current.get(activeLabel);
          if (activeWv) {
            if (blockingModalRef.current) {
              await activeWv.hide().catch(console.error);
            } else {
              await Promise.all([
                activeWv.setPosition(new LogicalPosition(rect.x, rect.y)),
                activeWv.setSize(new LogicalSize(rect.width, rect.height))
              ]);
              await activeWv.show().catch(console.error);
            }
          }
        }
      } catch (e) {
        if (!String(e).includes("webview not found")) {
          console.error("Failed to update webview bounds:", e);
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

      const activeWebviewsCount = browserTabs.filter(t => !t.sleeping).length;
      if (activeWebviewsCount > maxActiveWebviews) {
        const oldestNonActive = browserTabs.find(t => !t.sleeping && t.id !== activeBrowserTabId);
        if (oldestNonActive) {
          const newTabs = browserTabs.map(t => t.id === oldestNonActive.id ? { ...t, sleeping: true } : t);
          setBrowserTabs(newTabs);
          return;
        }
      }

      const container = document.getElementById('side-panel-browser-container');
      const containerRect = container ? container.getBoundingClientRect() : { x: window.innerWidth, y: window.innerHeight, width: 1, height: 1 };

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

        const isTabActive = isSideBrowserOpen && tab.id === activeBrowserTabId;
        const targetX = isTabActive ? containerRect.x : -9999;
        const targetY = isTabActive ? containerRect.y : -9999;

        if (!wv) {
          wv = new Webview(appWindow, label, {
            url: tab.url,
            x: targetX,
            y: targetY,
            width: containerRect.width,
            height: containerRect.height,
            transparent: false,
            backgroundColor: [15, 15, 15, 255]
          });
          webviewsRef.current.set(label, wv);
          wv.once('tauri://created', () => {
            setTimeout(() => {
              invoke('webview_eval', { label, script: `window.location.href = "${tab.url}";` }).catch(() => { });
            }, 100);
          });
        } else {
          wv.setPosition(new LogicalPosition(targetX, targetY)).catch(console.error);
          if (isTabActive) {
            wv.setSize(new LogicalSize(containerRect.width, containerRect.height)).catch(console.error);
          }
        }

        if (isTabActive) {
          wv.show().catch(e => { if (!String(e).includes("not found")) console.error(e) });
          wv.setFocus().catch(e => { if (!String(e).includes("not found") && !String(e).includes("not allowed")) console.error(e) });
        } else {
          wv.hide().catch(e => { if (!String(e).includes("not found")) console.error(e) });
        }
      }

      const tabLabels = new Set(browserTabs.map(t => `side-browser-tab-${t.id}`));
      for (const [label, wv] of Array.from(webviewsRef.current.entries())) {
        if (!tabLabels.has(label)) {
          wv.close().catch(console.error);
          webviewsRef.current.delete(label);
        }
      }

      setTimeout(updateBounds, 100);
    };

    syncWebviews();

    setTimeout(updateBounds, 100);

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
  }, [hasInitialized, browserTabs, maxActiveWebviews, setBrowserTabs, activeBrowserTabId, isSideBrowserOpen]);

  useEffect(() => {
    let unlisten: () => void;

    if (isSideBrowserOpen) {
      invoke("start_downloads_watch", { extensions: activeGameSchema?.extensions?.supported || [] }).catch(console.error);

      listen<{ path: string }>("download_intercepted", (e) => {
        const filePath = e.payload.path;
        const w: any = window;
        if (w.__processedDownloads && w.__processedDownloads.has(filePath)) {
          const processedTime = w.__processedDownloads.get(filePath);
          if (Date.now() - processedTime < 5000) return; // Ignore if processed in the last 5 seconds
        }

        console.log("FRONTEND RECEIVED DOWNLOAD:", filePath);
        setDownloadsQueue(prev => {
          if (prev.includes(filePath)) return prev;
          return [...prev, filePath];
        });
      }).then(u => {
        unlisten = u;
      }).catch(console.error);
    } else {

    }

    return () => {
      if (unlisten) unlisten();
      invoke('stop_downloads_watch').catch(console.error);

    };
  }, [isSideBrowserOpen, setDownloadsQueue]);

  useEffect(() => {
    return () => {
      for (const wv of Array.from(webviewsRef.current.values())) {
        wv.close().catch(console.error);
      }
      webviewsRef.current.clear();
    };
  }, []);

  const handleNavigate = async (urlToNavigate: string) => {
    let finalUrl = urlToNavigate.trim();
    if (!finalUrl) return;

    if (!/^https?:\/\//i.test(finalUrl)) {
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
        finalUrl = 'https://' + finalUrl;
      } else {
        finalUrl = 'https://www.google.com/search?q=' + encodeURIComponent(finalUrl);
      }
    }

    setSideBrowserUrl(finalUrl);

    const label = `side-browser-tab-${activeBrowserTabId}`;
    const navigateWebview = (retries = 3) => {
      if (webviewsRef.current.has(label)) {
        invoke('webview_eval', { label, script: `window.location.href = "${finalUrl}";` })
          .catch(e => {
            if (retries > 0) setTimeout(() => navigateWebview(retries - 1), 200);
            else console.error(e);
          });
      } else {
        if (retries > 0) setTimeout(() => navigateWebview(retries - 1), 200);
      }
    };
    navigateWebview();

    setBrowserTabs((prevTabs: any[]) => {
      const newTabs = prevTabs.map(t => t.id === activeBrowserTabId ? { ...t, url: finalUrl, sleeping: false } : t);
      return [...newTabs];
    });

    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
  };

  const lastProcessedUrlRef = useRef(sideBrowserUrl);

  useEffect(() => {
    if (isSideBrowserOpen && hasInitialized && sideBrowserUrl && activeBrowserTabId) {
      if (sideBrowserUrl !== lastProcessedUrlRef.current) {
        lastProcessedUrlRef.current = sideBrowserUrl;
        const activeTab = browserTabs.find(t => t.id === activeBrowserTabId);
        if (activeTab && activeTab.url !== sideBrowserUrl && !activeTab.url.includes(sideBrowserUrl.split('?')[0])) {

          let finalUrl = sideBrowserUrl.trim();
          if (!/^https?:\/\//i.test(finalUrl) && finalUrl !== 'about:blank') {
            if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
              finalUrl = 'https://' + finalUrl;
            } else {
              finalUrl = 'https://www.google.com/search?q=' + encodeURIComponent(finalUrl);
            }
          }

          const newId = crypto.randomUUID();
          setBrowserTabs((prev: any) => [...prev, { id: newId, url: finalUrl, sleeping: false }]);
          setActiveBrowserTabId(newId);

          if (finalUrl !== sideBrowserUrl) {
            setTimeout(() => {
              setSideBrowserUrl(finalUrl);
              lastProcessedUrlRef.current = finalUrl;
            }, 10);
          }
        }
      }
    }
  }, [sideBrowserUrl, hasInitialized, isSideBrowserOpen, activeBrowserTabId, browserTabs]);


  const createNewTab = () => {
    const id = crypto.randomUUID();
    setBrowserTabs(prev => [...prev, { id, url: 'https://google.com', sleeping: false }]);
    setSideBrowserUrl('https://google.com');
    setActiveBrowserTabId(id);
  };

  const closeTab = (e: React.MouseEvent, idToClose: string) => {
    e.stopPropagation();
    const newTabs = browserTabs.filter(t => t.id !== idToClose);
    if (newTabs.length === 0) {
      setIsSideBrowserOpen(false);
      setBrowserTabs([]);
      setActiveBrowserTabId(null);
    } else if (activeBrowserTabId === idToClose) {
      const idx = browserTabs.findIndex(t => t.id === idToClose);
      const prevTab = newTabs[Math.max(0, idx - 1)];
      setActiveBrowserTabId(prevTab.id);
      const wokenTabs = newTabs.map(t => t.id === prevTab.id ? { ...t, sleeping: false } : t);
      setBrowserTabs(wokenTabs);
    } else {
      setBrowserTabs(newTabs);
    }
  };

  const toggleBookmark = () => {
    if (!activeBrowserTabId) return;
    const activeTab = browserTabs.find(t => t.id === activeBrowserTabId);
    if (!activeTab) return;

    const urlToBookmark = actualCurrentUrl || localUrlInput || activeTab.url;

    const isBookmarked = browserBookmarks.some(b => b.url === urlToBookmark);
    if (isBookmarked) {
      setBrowserBookmarks(browserBookmarks.filter(b => b.url !== urlToBookmark));
    } else {
      setBrowserBookmarks([...browserBookmarks, { url: urlToBookmark, title: urlToBookmark }]);
    }
  };

  if (!hasInitialized) return null;

  return createPortal(
    <div style={{ display: isSideBrowserOpen ? 'block' : 'none' }} className={isBlockingModalOpen ? "opacity-0 pointer-events-none transition-opacity duration-300" : "opacity-100 transition-opacity duration-300"}>
      <div className="fixed top-[52px] right-0 bottom-10 z-[100004] bg-black/20 backdrop-blur-[3px] transition-opacity" style={{ left: "var(--sidebar-width, 288px)" }} onClick={() => setIsSideBrowserOpen(false)} />
      {isResizing && <div className="fixed inset-0 z-[100010] cursor-col-resize" />}

      <div
        className={`fixed z-[100005] theme-glass-panel shadow-[[-20px_0_50px_rgba(0,0,0,0.5)]] flex flex-col overflow-hidden ${isBrowserFullscreen ? "top-[50px] inset-x-0 bottom-0 !border-0 rounded-none bg-[var(--bg)]" : "top-[52px] right-0 bottom-10 !border-y-0 !border-r-0 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-tl-[3rem] rounded-bl-[3rem] !rounded-r-none"
          }`}
        style={isBrowserFullscreen ? {} : { right: 0, width: panelWidth }}
      >
        <div className="pt-6 px-4 pb-4 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] shrink-0 relative bg-[color-mix(in_srgb,var(--text)_2%,transparent)] flex flex-col gap-3 rounded-tl-[3rem] !rounded-tr-none">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_20%,transparent)] to-transparent opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-b from-[color-mix(in_srgb,var(--text)_3%,transparent)] to-transparent pointer-events-none" />

          <div className="flex items-center gap-4 pl-4 pr-4">
            <button
              onClick={() => setIsSideBrowserOpen(false)}
              className="z-50 w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center text-[var(--subtext)] transition-all bg-black/10 backdrop-blur-[2px] hover:theme-bg-danger hover:text-white hover:scale-110 active:scale-95 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_50%,transparent)] shadow-xl group/closebtn"
            >
              <span className="material-symbols-outlined !text-[20px] group-hover/closebtn:rotate-90 transition-transform duration-300">close</span>
            </button>

            <div className="flex-1 flex items-center gap-2 bg-[color-mix(in_srgb,var(--bg)_30%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-[1.25rem] px-4 h-11 shadow-inner relative z-10 focus-within:border-[color-mix(in_srgb,var(--text)_30%,transparent)] transition-colors">

              {/* Back / Forward / Refresh */}
              <div className="flex items-center gap-1 border-r border-[color-mix(in_srgb,var(--text)_10%,transparent)] pr-2 mr-1">
                <button
                  onClick={() => {
                    const label = `side-browser-tab-${activeBrowserTabId}`;
                    invoke('webview_eval', { label, script: 'window.history.back()' }).catch(console.error);
                  }}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-colors"
                >
                  <span className="material-symbols-outlined !text-[18px]">arrow_back</span>
                </button>
                <button
                  onClick={() => {
                    const label = `side-browser-tab-${activeBrowserTabId}`;
                    invoke('webview_eval', { label, script: 'window.history.forward()' }).catch(console.error);
                  }}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-colors"
                >
                  <span className="material-symbols-outlined !text-[18px]">arrow_forward</span>
                </button>
                <button
                  onClick={() => {
                    const label = `side-browser-tab-${activeBrowserTabId}`;
                    invoke('webview_eval', { label, script: 'window.location.reload()' }).catch(console.error);
                  }}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-colors"
                >
                  <span className="material-symbols-outlined !text-[18px]">refresh</span>
                </button>
              </div>

              <span className="material-symbols-outlined !text-[18px] theme-text-accent ml-1">public</span>
              <input
                value={localUrlInput}
                onChange={(e) => setLocalUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleNavigate(localUrlInput); }}
                className="flex-1 bg-transparent border-none outline-none text-[14px] text-[var(--text)] font-medium placeholder-[var(--subtext)]"
                placeholder="Search or enter URL..."
              />
              <button onClick={() => {
                invoke('webview_url', { label: `side-browser-tab-${activeBrowserTabId}` })
                  .then((url) => {
                    import('@tauri-apps/plugin-opener').then(m => m.openUrl(url as string));
                  })
                  .catch((err) => {
                    console.error("Failed to get current url", err);
                    import('@tauri-apps/plugin-opener').then(m => m.openUrl(localUrlInput));
                  });
              }} className="shrink-0 flex items-center gap-1 transition-all hover:scale-105 active:scale-95 text-[var(--subtext)] hover:text-[var(--accent)] focus:outline-none ml-1 mr-2 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-1.5 rounded-full border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-inner">
                <span className="text-[9px] font-black tracking-widest uppercase mt-0.5">Open External</span>
                <span className="material-symbols-outlined !text-[16px]">open_in_new</span>
              </button>
              <button onClick={toggleBookmark} className="shrink-0 transition-all hover:scale-110 active:scale-95 text-[var(--subtext)] hover:text-yellow-400 focus:outline-none">
                <span className={`material-symbols-outlined !text-[20px] ${browserBookmarks.some(b => b.url === (actualCurrentUrl || localUrlInput)) ? 'fill-current text-yellow-400' : ''}`}>star</span>
              </button>
              <button onClick={() => setIsBookmarksDropdownOpen(!isBookmarksDropdownOpen)} className={`shrink-0 transition-all hover:scale-110 active:scale-95 focus:outline-none ml-2 ${isBookmarksDropdownOpen ? 'text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)]'}`}>
                <span className="material-symbols-outlined !text-[20px]">{isBookmarksDropdownOpen ? 'menu_open' : 'menu'}</span>
              </button>
              <button onClick={() => setIsBrowserFullscreen(!isBrowserFullscreen)} className={`shrink-0 transition-all hover:scale-110 active:scale-95 focus:outline-none ml-2 mr-1 ${isBrowserFullscreen ? 'text-[var(--accent)]' : 'text-[var(--subtext)] hover:text-[var(--text)]'}`}>
                <span className="material-symbols-outlined !text-[20px]">{isBrowserFullscreen ? 'fullscreen_exit' : 'fullscreen'}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 px-4 pt-1 overflow-x-auto custom-scrollbar relative z-10 pb-2">
            <div className="flex items-center overflow-x-auto custom-scrollbar theme-glass-panel rounded-2xl divide-x divide-white/5 border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-inner shrink-0 relative z-10">
              {browserTabs.map(tab => {
                const isActive = tab.id === activeBrowserTabId;
                return (
                  <div
                    key={tab.id}
                    onClick={() => {
                      setActiveBrowserTabId(tab.id);
                      if (tab.sleeping) {
                        const newTabs = browserTabs.map(t => t.id === tab.id ? { ...t, sleeping: false } : t);
                        setBrowserTabs(newTabs);
                      }
                    }}
                    onAuxClick={(e) => {
                      if (e.button === 1) closeTab(e as any, tab.id);
                    }}
                    className={`group h-10 px-4 flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap cursor-pointer ${isActive
                      ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]'
                      : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 opacity-80 hover:opacity-100'
                      } ${tab.sleeping ? 'opacity-50' : 'opacity-100'}`}
                  >
                    <div className="max-w-[120px] truncate">{tab.url.replace(/^https?:\/\/(www\.)?/, '')}</div>
                    <button onClick={(e) => closeTab(e, tab.id)} className={`shrink-0 flex items-center justify-center rounded-full hover:bg-[color-mix(in_srgb,var(--text)_20%,transparent)] w-4 h-4 text-inherit transition-all ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <span className="material-symbols-outlined !text-[12px]">close</span>
                    </button>
                  </div>
                );
              })}
              <button onClick={createNewTab} className="w-10 h-10 flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-all">
                <span className="material-symbols-outlined !text-[18px]">add</span>
              </button>
            </div>

          </div>
        </div>

        <div className="flex-1 w-full flex flex-row relative min-h-0">

          <div
            className="w-4 shrink-0 cursor-col-resize hover:bg-[var(--accent)]/30 transition-colors z-[10000] flex flex-col items-center justify-center relative group/resize"
            onMouseDown={() => { setIsResizing(true); isResizingRef.current = true; window.dispatchEvent(new Event('resize')); }}
          >
            <div className="w-1 h-12 rounded-full bg-[var(--accent)] opacity-0 group-hover/resize:opacity-100 transition-opacity" />
          </div>

          <div className="flex-1 h-full pb-6 flex overflow-hidden relative min-h-0 pr-2">
            <div className={`flex-1 h-full bg-[color-mix(in_srgb,var(--bg)_40%,transparent)] backdrop-blur-xl flex pointer-events-none rounded-[var(--radius)] overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-[10px] relative ${isBookmarksDropdownOpen ? 'gap-[10px]' : ''}`}>
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--text)]/5 to-transparent pointer-events-none" />

              <div id="side-panel-browser-container" ref={containerRef} className="flex-1 rounded-[0.5rem] overflow-hidden relative pointer-events-auto shadow-[inset_0_0_10px_rgba(0,0,0,0.8)] bg-black/50">
                {browserTabs.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-50 animate-in fade-in duration-500">
                    <span className="material-symbols-outlined !text-[64px] text-[var(--subtext)] opacity-30 mb-4 drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]">public</span>
                    <h2 className="text-[18px] font-black tracking-widest text-[var(--text)] opacity-50 uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">Ready to Browse</h2>
                    <p className="text-[12px] text-[var(--subtext)] opacity-50 mt-2 max-w-xs text-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">Open a new tab or search the web to get started.</p>
                    <button onClick={createNewTab} className="mt-8 pointer-events-auto px-8 py-3 rounded-xl bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] backdrop-blur-md border border-[var(--accent)]/30 text-[var(--accent)] shadow-[0_4px_12px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.1)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:shadow-[0_4px_20px_rgba(var(--accent-rgb),0.4),inset_0_1px_1px_rgba(255,255,255,0.2)] active:scale-95 transition-all font-black text-[11px] tracking-widest uppercase flex items-center gap-2">
                      <span className="material-symbols-outlined !text-[16px]">add</span>
                      New Tab
                    </button>
                  </div>
                )}
              </div>

              {isBookmarksDropdownOpen && (
                <div className="w-72 shrink-0 h-full flex flex-col animate-in slide-in-from-right-4 z-50 min-h-0 relative pointer-events-auto bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-[0.5rem] overflow-hidden border border-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-[inset_0_0_10px_rgba(0,0,0,0.3)]">
                  <div className="px-6 py-5 bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex justify-between items-center relative">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--text)_20%,transparent)] to-transparent opacity-50" />
                    <div className="flex items-center overflow-hidden theme-glass-panel rounded-2xl divide-x divide-white/5 border border-white/5 shadow-inner relative z-10 w-full shrink-0">
                      <button onClick={() => setDrawerTab('bookmarks')} className={`h-full py-2 flex-1 flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${drawerTab === 'bookmarks' ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'text-[var(--subtext)] hover:bg-white/5 hover:text-[var(--text)] opacity-60 hover:opacity-100'}`}>
                        <span className="material-symbols-outlined !text-[16px]">bookmarks</span>
                        Bookmarks
                      </button>
                      <button onClick={() => setDrawerTab('history')} className={`h-full py-2 flex-1 flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${drawerTab === 'history' ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] shadow-[inset_0_0_20px_color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'text-[var(--subtext)] hover:bg-white/5 hover:text-[var(--text)] opacity-60 hover:opacity-100'}`}>
                        <span className="material-symbols-outlined !text-[16px]">history</span>
                        History
                      </button>
                    </div>
                    <button onClick={drawerTab === 'bookmarks' ? toggleBookmark : () => setBrowserHistory([])} className="hover:text-[var(--accent)] transition-colors flex items-center w-8 h-8 rounded-full hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] justify-center relative z-10">
                      <span className="material-symbols-outlined !text-[18px]">{drawerTab === 'bookmarks' ? (browserBookmarks.some(b => b.url === (actualCurrentUrl || localUrlInput)) ? 'bookmark_remove' : 'bookmark_add') : 'delete_sweep'}</span>
                    </button>
                  </div>

                  <div className="px-3 pt-3 pb-1 shrink-0 relative z-10">
                    <div className="relative flex items-center w-full">
                      <span className="material-symbols-outlined absolute left-3 !text-[16px] text-[var(--subtext)] pointer-events-none">search</span>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={`Search ${drawerTab}...`}
                        className="w-full bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl py-2 pl-9 pr-3 text-[12px] text-[var(--text)] placeholder-[var(--subtext)] outline-none focus:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] transition-colors shadow-inner"
                      />
                      {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-2 w-6 h-6 flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] transition-colors rounded-full hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                          <span className="material-symbols-outlined !text-[14px]">close</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-y-auto custom-scrollbar flex-1 min-h-0 p-3 flex flex-col gap-2 relative z-10">
                    {drawerTab === 'bookmarks' ? (
                      browserBookmarks.filter(b => b.title.toLowerCase().includes(searchQuery.toLowerCase()) || b.url.toLowerCase().includes(searchQuery.toLowerCase())).map((b, index) => (
                        <div
                          key={`${b.url}-${index}`}
                          onClick={() => {
                            if (editingBookmarkUrl !== b.url) {
                              setSideBrowserUrl(b.url);
                              setIsBookmarksDropdownOpen(false);
                            }
                          }}
                          onAuxClick={(e) => {
                            if (e.button === 1 && editingBookmarkUrl !== b.url) {
                              const newId = crypto.randomUUID();
                              setBrowserTabs((prev: any) => [...prev, { id: newId, url: b.url, sleeping: false }]);
                              setActiveBrowserTabId(newId);
                              setIsBookmarksDropdownOpen(false);
                            }
                          }}
                          className="px-4 py-3 text-left rounded-2xl theme-glass-panel border border-transparent hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)] transition-all flex flex-col gap-1 group bg-[color-mix(in_srgb,var(--text)_3%,transparent)] cursor-pointer"
                        >
                          {editingBookmarkUrl === b.url ? (
                            <div className="flex flex-col gap-2 w-full" onClick={e => e.stopPropagation()}>
                              <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} className="bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[12px] font-bold text-[var(--text)] px-2 py-1.5 rounded-lg outline-none border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)]" placeholder="Bookmark Title" />
                              <input type="text" value={editUrl} onChange={e => setEditUrl(e.target.value)} className="bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[10px] font-mono text-[var(--subtext)] px-2 py-1.5 rounded-lg outline-none border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:border-[var(--accent)]" placeholder="URL" />
                              <div className="flex gap-2 justify-end mt-1">
                                <button onClick={() => setEditingBookmarkUrl(null)} className="text-[10px] uppercase font-bold text-[var(--subtext)] hover:text-[var(--text)] px-3 py-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors">Cancel</button>
                                <button onClick={() => {
                                  setBrowserBookmarks(browserBookmarks.map(bm => bm.url === b.url ? { ...bm, title: editTitle, url: editUrl } : bm));
                                  setEditingBookmarkUrl(null);
                                }} className="text-[10px] uppercase font-bold text-[var(--accent)] hover:text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] transition-colors px-3 py-1.5 rounded-lg">Save</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center justify-between gap-3 w-full overflow-hidden">
                                <span className="text-[12px] font-bold truncate text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">{b.title.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <span
                                    className="material-symbols-outlined !text-[14px] hover:text-[var(--accent)] shrink-0 p-1 rounded-full hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingBookmarkUrl(b.url);
                                      setEditTitle(b.title);
                                      setEditUrl(b.url);
                                    }}
                                  >edit</span>
                                  <span
                                    className="material-symbols-outlined !text-[16px] hover:text-red-400 shrink-0 p-1 rounded-full hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setBrowserBookmarks(browserBookmarks.filter(bm => bm.url !== b.url));
                                    }}
                                  >delete</span>
                                </div>
                              </div>
                              <span className="text-[10px] font-mono truncate opacity-40 group-hover:opacity-60 transition-opacity text-[var(--subtext)] group-hover:text-[var(--text)]">{b.url}</span>
                            </>
                          )}
                        </div>
                      ))
                    ) : (
                      (() => {
                        const filteredHistory = browserHistory.filter(h => h.title.toLowerCase().includes(searchQuery.toLowerCase()) || h.url.toLowerCase().includes(searchQuery.toLowerCase()));

                        const groupedHistory: Record<string, typeof browserHistory> = {};
                        filteredHistory.forEach(h => {
                          const date = new Date(h.timestamp).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                          if (!groupedHistory[date]) groupedHistory[date] = [];
                          groupedHistory[date].push(h);
                        });

                        return Object.entries(groupedHistory).map(([date, items]) => {
                          const isExpanded = expandedHistoryDays[date];
                          return (
                            <div key={date} className="flex flex-col gap-2">
                              <div
                                className="flex items-center justify-between px-2 py-1 cursor-pointer group"
                                onClick={() => setExpandedHistoryDays(prev => ({ ...prev, [date]: !prev[date] }))}
                              >
                                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] group-hover:text-[var(--text)] transition-colors">{date}</span>
                                <span className="material-symbols-outlined !text-[14px] text-[var(--subtext)] group-hover:text-[var(--text)] transition-transform" style={{ transform: !isExpanded ? 'rotate(-90deg)' : 'none' }}>expand_more</span>
                              </div>
                              {isExpanded && (
                                <div className="flex flex-col gap-2 pl-2 border-l border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                                  {items.map((h, index) => {
                                    const domain = h.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] || h.title;
                                    const path = h.url.replace(/^https?:\/\/(www\.)?([^/]+)/, '') || '/';
                                    return (
                                      <button
                                        key={`${h.timestamp}-${index}`}
                                        onClick={() => {
                                          setSideBrowserUrl(h.url);
                                          setIsBookmarksDropdownOpen(false);
                                        }}
                                        onAuxClick={(e) => {
                                          if (e.button === 1) {
                                            const newId = crypto.randomUUID();
                                            setBrowserTabs((prev: any) => [...prev, { id: newId, url: h.url, sleeping: false }]);
                                            setActiveBrowserTabId(newId);
                                            setIsBookmarksDropdownOpen(false);
                                          }
                                        }}
                                        className="px-4 py-3 text-left rounded-2xl theme-glass-panel border border-transparent hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)] text-[var(--subtext)] hover:text-[var(--text)] transition-all flex flex-col gap-1 group bg-[color-mix(in_srgb,var(--text)_3%,transparent)]"
                                      >
                                        <div className="flex items-center justify-between gap-3 w-full overflow-hidden">
                                          <span className="text-[12px] font-bold truncate text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">{domain}</span>
                                          <span
                                            className="material-symbols-outlined !text-[16px] opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400 shrink-0 p-1 rounded-full hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setBrowserHistory(browserHistory.filter(bm => bm.timestamp !== h.timestamp));
                                            }}
                                          >delete</span>
                                        </div>
                                        <span className="text-[10px] font-mono truncate opacity-40 group-hover:opacity-60 transition-opacity">{path}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()
                    )}

                    {drawerTab === 'bookmarks' && browserBookmarks.length === 0 && (
                      <div className="px-4 py-12 flex flex-col items-center justify-center text-[var(--subtext)] gap-3 opacity-60">
                        <span className="material-symbols-outlined !text-[32px] opacity-40">bookmark</span>
                        <span className="text-[11px] font-black uppercase tracking-widest text-center">No bookmarks yet</span>
                      </div>
                    )}

                    {drawerTab === 'history' && browserHistory.length === 0 && (
                      <div className="px-4 py-12 flex flex-col items-center justify-center text-[var(--subtext)] gap-3 opacity-60">
                        <span className="material-symbols-outlined !text-[32px] opacity-40">history</span>
                        <span className="text-[11px] font-black uppercase tracking-widest text-center">No history yet</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {downloadsQueue.length > 0 && (
          <div className="shrink-0 m-4 mt-0 theme-glass-panel border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] rounded-[var(--radius)] p-4 flex flex-col gap-3 z-50 animate-in slide-in-from-bottom-10 backdrop-blur-3xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] pb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] animate-bounce">download</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">Downloads Intercepted</span>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] px-2 py-0.5 rounded-full">{downloadsQueue.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[250px] overflow-y-auto accent-scrollbar p-1">
              {downloadsQueue.map(filePath => {
                const fileName = filePath.split(/[/\\]/).pop() || "Unknown File";
                return (
                  <div key={filePath} className="flex flex-col justify-between bg-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-md p-3 rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] group shadow-sm hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all">
                    <span className="text-[11px] font-bold text-[var(--text)] truncate mb-3" title={fileName}>{fileName}</span>
                    <div className="flex gap-2 justify-end w-full">
                      <button
                        onClick={() => {
                          const w: any = window;
                          if (!w.__processedDownloads || typeof w.__processedDownloads.set !== 'function') {
                            w.__processedDownloads = new Map();
                          }
                          w.__processedDownloads.set(filePath, Date.now());
                          setDownloadsQueue(prev => prev.filter(p => p !== filePath));
                        }}
                        className="flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-red-500/20 text-[var(--subtext)] hover:text-red-400 border border-transparent hover:border-red-500/30"
                      >
                        Ignore
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            const w: any = window;
                            if (!w.__processedDownloads || typeof w.__processedDownloads.set !== 'function') {
                              w.__processedDownloads = new Map();
                            }
                            w.__processedDownloads.set(filePath, Date.now());
                            setDownloadsQueue(prev => prev.filter(p => p !== filePath));
                            await invoke("ingest_dropped_file", { path: filePath, forceReplace: false, targetFolder: null });
                            await invoke("delete_local_file", { path: filePath });
                          } catch (err) {
                            console.error("Failed to ingest file", err);
                            alert(`Failed to ingest file: ${err}`);
                          }
                        }}
                        className="flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.5)]"
                      >
                        Import
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}
